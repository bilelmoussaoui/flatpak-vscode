import * as path from 'path'
import * as vscode from 'vscode'
import { execTask, findManifest, parseManifest } from './utils'
import { TaskMode, getFlatpakTasks } from './tasks'
import { promises as fs } from 'fs'

const EXT_ID = 'flatpakvscode'

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // Look for a flatpak manifest
  const manifestUri = await findManifest()

  if (manifestUri) {
    await vscode.window
      .showInformationMessage(
        'A Flatpak manifest was found, do you want to configure it?',
        ...['No', 'Yes']
      )
      .then(async (response: string | undefined) => {
        if (response === 'Yes') {
          await vscode.commands.executeCommand(
            `${EXT_ID}.${TaskMode.buildInit}`
          )
        }
      })

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
        async provideTasks() {
          const manifest = await parseManifest(manifestUri)
          if (manifest) {
            return getFlatpakTasks(manifest, manifestUri)
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
        `${EXT_ID}.build-init`,
        async () =>
          await execTask(TaskMode.buildInit, 'Configuring the build...')
      )
    )

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `${EXT_ID}.update-deps`,
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
        `${EXT_ID}.rebuild`,
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
