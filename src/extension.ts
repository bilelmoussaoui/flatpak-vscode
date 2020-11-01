import * as path from 'path'
import * as vscode from 'vscode'
import { execTask, findManifest, parseManifest } from './utils'
import { TaskMode, getTasks } from './tasks'
import { promises as fs } from 'fs'

const EXT_ID = 'flatpak-vscode'

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // Look for a flatpak manifest
  const manifestUri = await findManifest()
  if (manifestUri) {
    vscode.window
      .showInformationMessage(
        'Flatpak manifest detected, would you like VS Code to init a build ?',
        ...['No', 'Yes']
      )
      .then(
        async (response) => {
          if (response === 'Yes') {
            await vscode.commands.executeCommand(
              `${EXT_ID}.${TaskMode.buildInit}`
            )
          }
        },
        () => {
          // Do nothing
        }
      )

    vscode.tasks.onDidEndTask(async (e) => {
      switch (e.execution.task.definition.mode) {
        case TaskMode.buildInit:
          await vscode.commands.executeCommand(
            `${EXT_ID}.${TaskMode.updateDeps}`
          )
          break
        case TaskMode.updateDeps:
          await vscode.commands.executeCommand(
            `${EXT_ID}.${TaskMode.buildDeps}`
          )
          break
        case TaskMode.rebuild:
          await vscode.commands.executeCommand(`${EXT_ID}.${TaskMode.run}`)
          break
      }
    })

    context.subscriptions.push(
      vscode.tasks.registerTaskProvider('flatpak', {
        async provideTasks(): Promise<vscode.Task[] | null> {
          const manifest = await parseManifest(manifestUri)
          if (manifest) {
            const tasks = getTasks(manifest, manifestUri)
            return tasks
          }
          return null
        },
        resolveTask(): vscode.ProviderResult<vscode.Task> {
          return undefined
        },
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.buildInit}`,
        async () =>
          await execTask(TaskMode.buildInit, 'Configuring the build...')
      )
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.updateDeps}`,
        async () =>
          await execTask(TaskMode.updateDeps, 'Updating the dependencies...')
      )
    )
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.buildDeps}`,
        async () =>
          await execTask(TaskMode.buildDeps, 'Building the dependencies...')
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
          const workspace = vscode.workspace.getWorkspaceFolder(manifestUri)
            ?.uri.fsPath
          if (workspace) {
            await fs.rmdir(path.join(workspace, '.flatpak'), {
              recursive: true,
            })
            await vscode.commands.executeCommand(
              `${EXT_ID}.${TaskMode.buildInit}`
            )
          }
        }
      )
    )
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.${TaskMode.run}`,
        async () => await execTask(TaskMode.run, 'Running the application...')
      )
    )
  }
}
