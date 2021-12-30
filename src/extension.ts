import * as store from './store'
import { window, ExtensionContext, commands } from 'vscode'
import { exists, findManifests } from './utils'
import { promises as fs } from 'fs'
import { FlatpakTaskTerminal, TaskMode } from './terminal'
const { executeCommand, registerCommand } = commands
const { showInformationMessage } = window

const EXT_ID = 'flatpak-vscode'


export async function activate(context: ExtensionContext): Promise<void> {
  // Look for a flatpak manifest
  const isSandboxed = await exists('/.flatpak-info')
  const manifests = await findManifests(isSandboxed)
  if (manifests.length > 0) {
    manifests.forEach((manifest) => store.manifestFound(manifest))
    //TODO: allow the user to select a manifest
    const manifest = manifests[0]
    // Create the build directory if it doesn't exists
    if (!(await exists(manifest.buildDir))) {
      await fs.mkdir(manifest.buildDir)
    }
    // Mark the app as already initialized
    store.manifestSelected(manifest)

    const outputChannel = window.createOutputChannel('Flatpak')
    // Create a Flatpak pty
    const terminal = new FlatpakTaskTerminal(outputChannel)

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
      registerCommand(`${EXT_ID}.${TaskMode.buildInit}`, () => {
        if (!store.state.getState().pipeline.initialized) {
          // Ensures we have a terminal to receive the output
          outputChannel.show(true)
          terminal.setCommands([manifest.initBuild()], TaskMode.buildInit)
        }
      })
    )

    // Update the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.updateDeps}`, () => {
        if (store.state.getState().pipeline.initialized) {
          outputChannel.show(true)
          terminal.setCommands(
            [manifest.updateDependencies()],
            TaskMode.updateDeps
          )
        }
      })
    )

    // Build the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildDeps}`, () => {
        if (!store.state.getState().pipeline.dependencies.built) {
          outputChannel.show(true)
          terminal.setCommands(
            [manifest.buildDependencies()],
            TaskMode.buildDeps
          )
        }
      })
    )

    // Build the application
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildApp}`, () => {
        if (store.state.getState().pipeline.dependencies.built) {
          outputChannel.show(true)
          terminal.setCommands(manifest.build(false), TaskMode.buildApp)
        }
      })
    )

    // Rebuild the application
    // If a buildsystem is set on the latest module, the build/rebuild commands
    // could be different, the rebuild also triggers a run command afterwards
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.rebuild}`, () => {
        if (store.state.getState().pipeline.application.built) {
          outputChannel.show(true)
          terminal.setCommands(manifest.build(true), TaskMode.rebuild)
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
      registerCommand(`${EXT_ID}.${TaskMode.run}`, () => {
        if (store.state.getState().pipeline.application.built) {
          outputChannel.show(true)
          terminal.setCommands([manifest.run()], TaskMode.run)
        }
      })
    )
  }
}

export async function deactivate(_context: ExtensionContext) {
  const manifest = store.state.getState().selectedManifest
  if (manifest) {
    switch (manifest?.sdk()) {
      case 'rust':
        manifest.restoreWorkspaceConfig('rust-analyzer',
          'server.path')
        manifest.restoreWorkspaceConfig('rust-analyzer',
          'files.excludeDirs')
        break
    }
  }
}