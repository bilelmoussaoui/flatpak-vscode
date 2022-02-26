import * as store from './store'
import { window, ExtensionContext, commands, TerminalProfile } from 'vscode'
import { exists, ensureDocumentsPortal } from './utils'
import { existsSync, promises as fs } from 'fs'
import { StatusBarItem } from './statusBarItem'
import { FlatpakRunner } from './flatpakRunner'
import { TaskMode } from './taskMode'
import { restoreRustAnalyzerConfigOverrides } from './integration/rustAnalyzer'
import { findManifests } from './flatpakManifestUtils'
import { FlatpakTerminal } from './flatpakTerminal'
import { execSync } from 'child_process'
import { Command } from './command'
const { executeCommand, registerCommand } = commands

export const EXT_ID = 'flatpak-vscode'

// whether VSCode is installed in a sandbox
export const IS_SANDBOXED = existsSync('/.flatpak-info')
// Currently installed Flatpak version
export let FLATPAK_VERSION: string

export let statusBarItem: StatusBarItem | undefined

export async function activate(context: ExtensionContext): Promise<void> {
  statusBarItem = new StatusBarItem(context)
  FLATPAK_VERSION = execSync((new Command('flatpak', ['--version'])).toString()).
    toString().trim().replace('Flatpak', '').trim()

  console.log(`Flatpak version: ${FLATPAK_VERSION}`)
  console.log(`is VSCode running in sandbox: ${IS_SANDBOXED.toString()}`)

  // Look for a flatpak manifest
  const manifests = await findManifests()

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

    const terminal = new FlatpakTerminal()
    const runner = new FlatpakRunner(terminal)

    window.registerTerminalProfileProvider(`${EXT_ID}.runtime-terminal-provider`, {
      provideTerminalProfile: () => {
        return new TerminalProfile(manifest.runtimeTerminal())
      }
    })

    window.registerTerminalProfileProvider(`${EXT_ID}.build-terminal-provider`, {
      provideTerminalProfile: () => {
        return new TerminalProfile(manifest.buildTerminal())
      }
    })

    context.subscriptions.push(
      registerCommand(`${EXT_ID}.runtime-terminal`, () => {
        const runtimeTerminal = window.createTerminal(manifest.runtimeTerminal())
        runtimeTerminal.show()
      })
    )

    context.subscriptions.push(
      registerCommand(`${EXT_ID}.build-terminal`, () => {
        const buildTerminal = window.createTerminal(manifest.buildTerminal())
        buildTerminal.show()
      })
    )

    context.subscriptions.push(
      registerCommand(`${EXT_ID}.show-output-terminal`, async () => {
        await terminal.show(true)
      })
    )

    // Init the build environment
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildInit}`, async (completeBuild: boolean | undefined) => {
        runner.completeBuild = completeBuild || false
        if (!store.state.getState().pipeline.initialized) {
          // Ensures we have a terminal to receive the output
          await terminal.show(true)
          runner.setCommands([manifest.initBuild()], TaskMode.buildInit)
        }
      })
    )

    // Update the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.updateDeps}`, async (completeBuild: boolean | undefined) => {
        runner.completeBuild = completeBuild || false
        if (store.state.getState().pipeline.initialized) {
          await terminal.show(true)
          runner.setCommands(
            [manifest.updateDependencies()],
            TaskMode.updateDeps
          )
        }
      })
    )

    // Build the application's dependencies
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.buildDeps}`, async (completeBuild: boolean | undefined) => {
        runner.completeBuild = completeBuild || false
        if (!store.state.getState().pipeline.dependencies.built) {
          await terminal.show(true)
          runner.setCommands(
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
          await terminal.show(true)
          runner.setCommands(manifest.build(false), TaskMode.buildApp)
        }
      })
    )

    // Rebuild the application
    // If a buildsystem is set on the latest module, the build/rebuild commands
    // could be different, the rebuild also triggers a run command afterwards
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.rebuild}`, async () => {
        if (store.state.getState().pipeline.application.built) {
          await terminal.show(true)
          runner.setCommands(manifest.build(true), TaskMode.rebuild)
        }
      })
    )

    // Clean build environment
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.${TaskMode.clean}`, async () => {
        if (store.state.getState().pipeline.initialized) {
          await terminal.show(true)
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
          await terminal.show(true)
          runner.setCommands([manifest.run()], TaskMode.run)
        }
      })
    )

    // A helper command, chains up to other commands based on current pipeline state
    context.subscriptions.push(
      registerCommand(`${EXT_ID}.build`, async () => {
        runner.completeBuild = true
        if (!store.state.getState().pipeline.initialized) {
          await executeCommand(`${EXT_ID}.${TaskMode.buildInit}`)
        } else if (!store.state.getState().pipeline.dependencies.updated) {
          await executeCommand(`${EXT_ID}.${TaskMode.updateDeps}`)
        } else if (!store.state.getState().pipeline.dependencies.built) {
          await executeCommand(`${EXT_ID}.${TaskMode.buildDeps}`)
        } else if (!store.state.getState().pipeline.application.built) {
          await executeCommand(`${EXT_ID}.${TaskMode.buildApp}`)
        } else {
          terminal.appendMessage('Nothing to do')
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
