import * as path from 'path'
import * as store from './store'
import * as vscode from 'vscode'
import { execTask, findManifest, parseManifest } from './utils'
import { TaskMode, getTasks } from './tasks'
import { promises as fs, constants as fsc } from 'fs'

const EXT_ID = 'flatpak-vscode'

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // Look for a flatpak manifest
  const manifestUri = await findManifest()
  if (manifestUri) {
    const workspace =
      vscode.workspace.getWorkspaceFolder(manifestUri)?.uri.fsPath || ''
    const buildDir = path.join(workspace, '.flatpak')
    fs.access(buildDir, fsc.F_OK).then(
      () => store.initialize(),
      () => store.clean()
    )

    vscode.window
      .showInformationMessage(
        'Flatpak manifest detected, would you like VS Code to init a build ?',
        ...['No', 'Yes']
      )
      .then(
        async (response) => {
          if (response === 'Yes') {
            // If the build repository wasn't initialized yet
            if (!store.initialized.getState()) {
              await vscode.commands.executeCommand(
                `${EXT_ID}.${TaskMode.buildInit}`
              )
            } else {
              // We assume that the dependencies were already downloaded here
              await vscode.commands.executeCommand(
                `${EXT_ID}.${TaskMode.buildDeps}`
              )
            }
          }
        },
        () => {
          // Do nothing
        }
      )

    vscode.tasks.onDidEndTask(async (e) => {
      switch (e.execution.task.definition.mode) {
        case TaskMode.buildInit:
          store.initialize()
          await vscode.commands.executeCommand(
            `${EXT_ID}.${TaskMode.updateDeps}`
          )
          break
        case TaskMode.buildDeps:
          store.dependenciesBuilt()
          break
        case TaskMode.updateDeps:
          store.dependenciesUpdated()
          await vscode.commands.executeCommand(
            `${EXT_ID}.${TaskMode.buildDeps}`
          )
          break
        case TaskMode.buildApp:
          store.applicationBuilt()
          break
        case TaskMode.rebuild:
          store.applicationBuilt()
          await vscode.commands.executeCommand(`${EXT_ID}.${TaskMode.run}`)
          break
      }
    })

    context.subscriptions.push(
      vscode.tasks.registerTaskProvider('flatpak', {
        async provideTasks() {
          const manifest = await parseManifest(manifestUri)
          if (manifest) {
            return getTasks(manifest, manifestUri)
          }
          return null
        },
        resolveTask() {
          return undefined
        },
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.buildInit}`,
        async () => {
          if (!store.initialized) {
            await execTask(TaskMode.buildInit, 'Configuring the build...')
          }
        }
      )
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.updateDeps}`,
        async () => {
          if (!store.dependencies.getState().updated) {
            await execTask(TaskMode.updateDeps, 'Updating the dependencies...')
          }
        }
      )
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.buildDeps}`,
        async () => {
          if (!store.dependencies.getState().built) {
            await execTask(TaskMode.buildDeps, 'Building the dependencies...')
          }
        }
      )
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.buildApp}`,
        async () =>
          await execTask(TaskMode.buildApp, 'Building the application...')
      )
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.rebuild}`,
        async () =>
          await execTask(TaskMode.rebuild, 'Rebuilding the application...')
      )
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.clean}`,
        async () => {
          if (store.initialized.getState()) {
            await fs.rmdir(buildDir, {
              recursive: true,
            })
            store.clean()
            await vscode.commands.executeCommand(
              `${EXT_ID}.${TaskMode.buildInit}`
            )
          }
        }
      )
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(`${EXT_ID}.${TaskMode.run}`, async () => {
        if (
          store.initialized.getState() &&
          store.dependencies.getState().built &&
          store.application.getState().built
        ) {
          await execTask(TaskMode.run, 'Running the application...')
        }
      })
    )
  }
}
