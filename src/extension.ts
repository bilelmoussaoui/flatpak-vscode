import * as store from './store'
import { window, tasks, ExtensionContext, commands } from 'vscode'
import {
  execTask,
  exists,
  findManifest,
  getBuildDir,
  getWorkspacePath,
} from './utils'
import { FlatpakTaskProvider, TaskMode } from './tasks'
import { promises as fs } from 'fs'
const { onDidEndTask, registerTaskProvider } = tasks
const { executeCommand, registerCommand } = commands
const { showInformationMessage } = window

const EXT_ID = 'flatpak-vscode'

export async function activate(context: ExtensionContext): Promise<void> {
  // Look for a flatpak manifest
  const [uri, manifest] = await findManifest()
  const isSandboxed = await exists('/.flatpak-info')


  if (uri && manifest) {
    const buildDir = getBuildDir(getWorkspacePath(uri))
    if (await exists(buildDir)) {
      store.initialize()
    }

    store.manifestFound()

    store.failed.watch(({command, message}) => {
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
      registerTaskProvider('flatpak', new FlatpakTaskProvider(manifest, uri, isSandboxed))
    )

    // Init the build environment
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildInit}`, async () => {
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
          await fs.rmdir(buildDir, {
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
