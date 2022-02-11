import * as store from './store'
import { window, ExtensionContext, commands, workspace, WorkspaceFolder } from 'vscode'
import { exists, findManifests, ensureDocumentsPortal } from './utils'
import { promises as fs } from 'fs'
import { StatusBarItem } from './statusBarItem'
import { FlatpakTerminal } from './flatpakTerminal'
import { TaskMode } from './taskMode'
import { loadRustAnalyzerConfigOverrides, restoreRustAnalyzerConfigOverrides } from './integration/rustAnalyzer'
import { Settings } from './store'
import { FlatpakManifestFinder } from './flatpakManifestFinder'

const { executeCommand, registerCommand } = commands
const { showInformationMessage } = window

export const EXT_ID = 'flatpak-vscode'
export let statusBarItem: StatusBarItem | undefined

export async function activate(context: ExtensionContext): Promise<void> {
  statusBarItem = new StatusBarItem(context)

  // Look for a flatpak manifest
  const manifestFinder = new FlatpakManifestFinder()
  const manifests = await manifestFinder.find()

  if (manifests.length > 0) {
    // Make sures the documents portal is running
    await ensureDocumentsPortal()

    manifests.forEach((manifest) => store.manifestFound(manifest))
    //TODO: allow the user to select a manifest
    const manifest = manifests[0]
    // Create the build directory if it doesn't exists
    if (!(await exists(manifest.buildDir))) {
      await fs.mkdir(manifest.buildDir)
    }
    // Mark the app as already initialized
    store.manifestSelected(manifest)

    // Watch for workspace config changes
    workspace.onDidChangeConfiguration(event => {
      // Apply changed settings
      for (const folder of workspace.workspaceFolders as WorkspaceFolder[]) {
        if (event.affectsConfiguration(`${EXT_ID}`, folder)) {
          switch (manifest?.sdk()) {
            case 'rust':
              {
                if (workspace.getConfiguration(`${EXT_ID}`).get(Settings.extensionsIntegration)) {
                  loadRustAnalyzerConfigOverrides(manifest)
                    .then(() => { }, () => { }) // eslint-disable-line @typescript-eslint/no-empty-function
                } else {
                  restoreRustAnalyzerConfigOverrides(manifest)
                    .then(() => { }, () => { }) // eslint-disable-line @typescript-eslint/no-empty-function
                }
              }
              break;
          }
          break;
        }
      }
    })

    const outputChannel = window.createOutputChannel('Flatpak')
    // Create a Flatpak pty
    const terminal = new FlatpakTerminal(outputChannel)

    if (!store.state.getState().pipeline.initialized) {
      showInformationMessage(
        'Flatpak manifest detected, would you like VS Code to init a build ?',
        ...['No', 'Yes']
      ).then(
        async (response) => {
          if (response === 'Yes') {
            // If the build repository wasn't initialized yet
            if (!store.state.getState().pipeline.initialized) {
              await executeCommand(`${EXT_ID}.${TaskMode.buildInit}`)
            } else {
              // We assume that the dependencies were already downloaded here
              await executeCommand(`${EXT_ID}.${TaskMode.buildDeps}`)
            }
          }
        },
        () => { } // eslint-disable-line @typescript-eslint/no-empty-function
      )
    }

    context.subscriptions.push(
      registerCommand(`${EXT_ID}.show-output-channel`, () => {
        outputChannel.show(true)
      })
    )

    context.subscriptions.push(
      registerCommand(`${EXT_ID}.runtime-terminal`, () => {
        const command = manifest.runtimeTerminal()
        const terminal = window.createTerminal('Flatpak: Runtime Terminal', command.name, command.arguments)
        terminal.show()
      })
    )

    context.subscriptions.push(
      registerCommand(`${EXT_ID}.build-terminal`, () => {
        const command = manifest.buildTerminal()
        const terminal = window.createTerminal('Flatpak: Build Terminal', command.name, command.arguments)
        terminal.show()
      })
    )

    // Init the build environment
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildInit}`, async (completeBuild: boolean | undefined) => {
        terminal.completeBuild = completeBuild || false
        if (!store.state.getState().pipeline.initialized) {
          // Ensures we have a terminal to receive the output
          outputChannel.show(true)
          await terminal.setCommands([manifest.initBuild()], TaskMode.buildInit)
        }
      })
    )

    // Update the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.updateDeps}`, async (completeBuild: boolean | undefined) => {
        terminal.completeBuild = completeBuild || false
        if (store.state.getState().pipeline.initialized) {
          outputChannel.show(true)
          await terminal.setCommands(
            [manifest.updateDependencies()],
            TaskMode.updateDeps
          )
        }
      })
    )

    // Build the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildDeps}`, async (completeBuild: boolean | undefined) => {
        terminal.completeBuild = completeBuild || false
        if (!store.state.getState().pipeline.dependencies.built) {
          outputChannel.show(true)
          await terminal.setCommands(
            [manifest.buildDependencies()],
            TaskMode.buildDeps
          )
        }
      })
    )

    // Build the application
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildApp}`, async () => {
        if (store.state.getState().pipeline.dependencies.built) {
          outputChannel.show(true)
          await terminal.setCommands(manifest.build(false), TaskMode.buildApp)
        }
      })
    )

    // Rebuild the application
    // If a buildsystem is set on the latest module, the build/rebuild commands
    // could be different, the rebuild also triggers a run command afterwards
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.rebuild}`, async () => {
        if (store.state.getState().pipeline.application.built) {
          outputChannel.show(true)
          await terminal.setCommands(manifest.build(true), TaskMode.rebuild)
        }
      })
    )

    // Clean build environment
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.clean}`, async () => {
        if (store.state.getState().pipeline.initialized) {
          outputChannel.show(true)
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
        if (store.state.getState().pipeline.application.built) {
          outputChannel.show(true)
          await terminal.setCommands([manifest.run()], TaskMode.run)
        }
      })
    )

    // A helper command, chains up to other commands based on current pipeline state
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.build`, async () => {
        terminal.completeBuild = true
        if (!store.state.getState().pipeline.initialized) {
          await executeCommand(`${EXT_ID}.${TaskMode.buildInit}`)
        } else if (!store.state.getState().pipeline.dependencies.updated) {
          await executeCommand(`${EXT_ID}.${TaskMode.updateDeps}`)
        } else if (!store.state.getState().pipeline.dependencies.built) {
          await executeCommand(`${EXT_ID}.${TaskMode.buildDeps}`)
        } else if (!store.state.getState().pipeline.application.built) {
          await executeCommand(`${EXT_ID}.${TaskMode.buildApp}`)
        } else {
          outputChannel.appendLine('Nothing to do')
        }
      })
    )
  }
}

export async function deactivate(): Promise<void> {
  const manifest = store.state.getState().selectedManifest
  if (manifest) {
    switch (manifest?.sdk()) {
      case 'rust':
        await restoreRustAnalyzerConfigOverrides(manifest)
        break
    }
  }
}
