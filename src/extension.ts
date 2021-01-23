import * as store from './store'
import { window, tasks, ExtensionContext, commands } from 'vscode'
import { execTask, exists, findManifests } from './utils'
import { FlatpakTaskProvider, TaskMode } from './tasks'
import { promises as fs } from 'fs'
const { onDidEndTask, registerTaskProvider } = tasks
const { executeCommand, registerCommand } = commands
const { showInformationMessage } = window

const EXT_ID = 'flatpak-vscode'

export async function activate(context: ExtensionContext): Promise<void> {
  // Look for a flatpak manifest
  const isSandboxed = await exists('/.flatpak-info')
  const manifests = await findManifests(isSandboxed)
  if (manifests.length > 0) {
    //TODO: allow the user to select a manifest
    const manifest = manifests[0]
    // Create the build directory if it doesn't exists
    if (!(await exists(manifest.buildDir))) {
      await fs.mkdir(manifest.buildDir)
    }
    // Mark the app as already initialized
    store.manifestFound(manifest)

    store.failure.watch(({ command, message }) => {
      console.log(message, command)
    })

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

    onDidEndTask(async (e) => {
      if (store.state.getState().pipeline.error !== null) {
        // Don't spawn the next task if there was a failure
        return
      }
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
        if (!store.state.getState().pipeline.initialized) {
          await execTask(TaskMode.buildInit, 'Configuring the build...')
        }
      })
    )

    // Update the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.updateDeps}`, async () => {
        if (!store.state.getState().pipeline.dependencies.updated) {
          await execTask(TaskMode.updateDeps, 'Updating the dependencies...')
        }
      })
    )

    // Build the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildDeps}`, async () => {
        if (!store.state.getState().pipeline.dependencies.built) {
          await execTask(TaskMode.buildDeps, 'Building the dependencies...')
        }
      })
    )

    // Build the application
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildApp}`, async () => {
        if (store.state.getState().pipeline.dependencies.built) {
          await execTask(TaskMode.buildApp, 'Building the application...')
        }
      })
    )

    // Rebuild the application
    // If a buildsystem is set on the latest module, the build/rebuild commands
    // could be different, the rebuild also triggers a run command afterwards
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.rebuild}`, async () => {
        if (store.state.getState().pipeline.application.built) {
          await execTask(TaskMode.rebuild, 'Rebuilding the application...')
        }
      })
    )

    // Clean build environment
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.clean}`, async () => {
        if (store.state.getState().pipeline.initialized) {
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
          await execTask(TaskMode.run, 'Running the application...')
        }
      })
    )
  }
}
