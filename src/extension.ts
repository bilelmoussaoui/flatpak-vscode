import * as store from './store'
import { window, tasks, ExtensionContext, commands, workspace } from 'vscode'
import { execTask, exists, findManifest } from './utils'
import { FlatpakTaskProvider, TaskMode } from './tasks'
import { promises as fs } from 'fs'
const { onDidEndTask, registerTaskProvider } = tasks
const { executeCommand, registerCommand } = commands
const { showInformationMessage } = window
import * as path from 'path'
import { downloadAndUnzipVSCode } from 'vscode-test'

const EXT_ID = 'flatpak-vscode'

export async function activate(context: ExtensionContext): Promise<void> {
  // Look for a flatpak manifest
  const isSandboxed = await exists('/.flatpak-info')
  const manifests = await findManifest(isSandboxed)
  if (manifests.length > 0) {
    //TODO: allow the user to select a manifest
    const manifest = manifests[0]
    if (await exists(manifest.buildDir)) {
      store.initialize()
    }

    // Automatically set stuff depending on the current SDK
    switch (manifest.sdk()) {
      case 'rust':
        {
          const commandPath = path.join(manifest.buildDir, 'rust-analyzer.sh')
          await manifest.runInRepo('rust-analyzer', true).save(commandPath)
          const config = workspace.getConfiguration('rust-analyzer')
          const currentServer = config.get<string>('server.path')
          if (currentServer !== commandPath) {
            await config.update('server.path', commandPath)
          }
        }
        break
    }

    store.manifestFound()

    store.failed.watch(({ command, message }) => {
      console.log(message, command)
    })

    showInformationMessage(
      'Flatpak manifest detected, would you like VS Code to init a build ?',
      ...['No', 'Yes']
    ).then(
      async (response) => {
        if (response === 'Yes') {
          // If the build repository wasn't initialized yet
          if (!store.initialized.getState()) {
            await executeCommand(`${EXT_ID}.${TaskMode.buildInit}`)
          } else {
            // We assume that the dependencies were already downloaded here
            await executeCommand(`${EXT_ID}.${TaskMode.buildDeps}`)
          }
        }
      },
      () => {} // eslint-disable-line @typescript-eslint/no-empty-function
    )

    onDidEndTask(async (e) => {
      switch (e.execution.task.definition.mode) {
        case TaskMode.buildInit:
          store.initialize()
          await executeCommand(`${EXT_ID}.${TaskMode.updateDeps}`)
          break
        case TaskMode.buildDeps:
          store.dependenciesBuilt()
          break
        case TaskMode.updateDeps:
          store.dependenciesUpdated()
          await executeCommand(`${EXT_ID}.${TaskMode.buildDeps}`)
          break
        case TaskMode.buildApp:
          store.applicationBuilt()
          break
        case TaskMode.rebuild:
          store.applicationBuilt()
          await executeCommand(`${EXT_ID}.${TaskMode.run}`)
          break
      }
    })

    context.subscriptions.push(
      registerTaskProvider('flatpak', new FlatpakTaskProvider(manifest))
    )

    context.subscriptions.push(
      registerCommand(`${EXT_ID}.runtime-terminal`, () => {
        const terminal = window.createTerminal('Flatpak: Runtime Terminal')
        terminal.sendText(manifest.runtimeTerminal().toString())
        terminal.show()
      })
    )

    context.subscriptions.push(
      registerCommand(`${EXT_ID}.build-terminal`, () => {
        const terminal = window.createTerminal('Flatpak: Build Terminal')

        terminal.sendText(manifest.buildTerminal().toString())
        terminal.show()
      })
    )

    // Init the build environment
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildInit}`, async () => {
        console.log(manifest.sdk())
        if (!store.initialized.getState()) {
          await execTask(TaskMode.buildInit, 'Configuring the build...')
        }
      })
    )

    // Update the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.updateDeps}`, async () => {
        if (!store.dependencies.getState().updated) {
          await execTask(TaskMode.updateDeps, 'Updating the dependencies...')
        }
      })
    )

    // Build the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildDeps}`, async () => {
        if (!store.dependencies.getState().built) {
          await execTask(TaskMode.buildDeps, 'Building the dependencies...')
        }
      })
    )

    // Build the application
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildApp}`, async () => {
        if (store.dependencies.getState().built) {
          await execTask(TaskMode.buildApp, 'Building the application...')
        }
      })
    )

    // Rebuild the application
    // If a buildsystem is set on the latest module, the build/rebuild commands
    // could be different, the rebuild also triggers a run command afterwards
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.rebuild}`, async () => {
        if (store.dependencies.getState().built) {
          await execTask(TaskMode.rebuild, 'Rebuilding the application...')
        }
      })
    )

    // Clean build environment
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.clean}`, async () => {
        if (store.initialized.getState()) {
          await fs.rmdir(manifest.buildDir, {
            recursive: true,
          })
          store.clean()
          await executeCommand(`${EXT_ID}.${TaskMode.buildInit}`)
        }
      })
    )

    // Run the application, only if it was already built
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.run}`, async () => {
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
