import * as vscode from 'vscode'
import { window, ExtensionContext, commands } from 'vscode'
import { existsSync } from 'fs'
import { ensureDocumentsPortal, appendWatcherExclude } from './utils'
import { TaskMode } from './taskMode'
import { ManifestManager } from './manifestManager'
import { Manifest } from './manifest'
import { WorkspaceState } from './workspaceState'
import { migrateStateToMemento } from './migration'
import { BuildPipeline } from './buildPipeline'
import { unloadIntegrations } from './integration'

export const EXTENSION_ID = 'flatpak-vscode'

/**
 * Whether VSCode is installed in a sandbox
 */
export const IS_SANDBOXED = existsSync('/.flatpak-info')

class Extension {
    private readonly extCtx: vscode.ExtensionContext
    private readonly workspaceState: WorkspaceState
    private readonly manifestManager: ManifestManager
    private readonly buildPipeline: BuildPipeline

    constructor(extCtx: vscode.ExtensionContext) {
        this.extCtx = extCtx
        this.workspaceState = new WorkspaceState(extCtx)

        this.manifestManager = new ManifestManager(this.workspaceState)
        this.extCtx.subscriptions.push(this.manifestManager)
        this.manifestManager.onDidActiveManifestChanged(async ([manifest, isLastActive]) => {
            await this.handleActiveManifestChanged(manifest, isLastActive)
        })

        this.buildPipeline = new BuildPipeline(this.workspaceState, this.manifestManager)
        this.extCtx.subscriptions.push(this.buildPipeline)
    }

    async activate() {
        await migrateStateToMemento(this.workspaceState)

        // Private commands
        this.registerCommand('show-active-manifest', async () => {
            await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
                await vscode.window.showTextDocument(activeManifest.uri)
            }, false)
        })

        // Public commands
        this.registerCommand('select-manifest', async () => {
            await this.manifestManager.selectManifest()
        })

        this.registerCommand('runtime-terminal', async () => {
            await this.manifestManager.doWithActiveManifest((activeManifest) => {
                const runtimeTerminal = window.createTerminal(activeManifest.runtimeTerminal())
                this.extCtx.subscriptions.push(runtimeTerminal)
                runtimeTerminal.show()
            })
        })

        this.registerCommand('build-terminal', async () => {
            await this.manifestManager.doWithActiveManifest((activeManifest) => {
                const buildTerminal = window.createTerminal(activeManifest.buildTerminal())
                this.extCtx.subscriptions.push(buildTerminal)
                buildTerminal.show()
            })
        })

        this.registerCommand('show-output-terminal', async () => {
            await this.buildPipeline.showOutputTerminal()
        })

        this.registerCommand(TaskMode.updateDeps, async () => {
            await this.buildPipeline.updateDependencies()
        })

        this.registerCommand('build-and-run', async () => {
            if (this.workspaceState.getApplicationBuilt()) {
                await this.buildPipeline.rebuildApplication()
            } else {
                await this.buildPipeline.build()
            }

            await this.buildPipeline.run()
        })

        this.registerCommand(TaskMode.stop, async () => {
            await this.buildPipeline.stop()
        })

        this.registerCommand(TaskMode.clean, async () => {
            await this.buildPipeline.clean()
        })

        this.registerCommand(TaskMode.run, async () => {
            await this.buildPipeline.run()
        })

        this.registerCommand(TaskMode.export, async () => {
            await this.buildPipeline.exportBundle()
        })

        this.registerCommand('build', async () => {
            await this.buildPipeline.build()
        })

        this.registerTerminalProfileProvider('runtime-terminal-provider', {
            provideTerminalProfile: () => {
                const activeManifest = this.manifestManager.getActiveManifest()
                if (activeManifest === null) {
                    throw Error('There is no active manifest. Please create or select one.')
                }
                return new vscode.TerminalProfile(activeManifest.runtimeTerminal())
            }
        })

        this.registerTerminalProfileProvider('build-terminal-provider', {
            provideTerminalProfile: () => {
                const activeManifest = this.manifestManager.getActiveManifest()
                if (activeManifest === null) {
                    throw Error('There is no active manifest. Please create or select one.')
                }
                if (!this.workspaceState.getInitialized()) {
                    // FIXME Ideally we should initialized the build environment here.
                    // But running build-init also triggers other commands. So that should
                    // be sorted first.
                    throw Error('Build environment is not initialized. Run a build command first.')
                }
                return new vscode.TerminalProfile(activeManifest.buildTerminal())
            }
        })

        console.log('All commands and terminal profile providers are now registered.')

        await this.manifestManager.loadLastActiveManifest()
    }

    async deactivate() {
        const activeManifest = this.manifestManager.getActiveManifest()
        if (activeManifest) {
            await unloadIntegrations(activeManifest)
        }
    }

    private registerTerminalProfileProvider(name: string, provider: vscode.TerminalProfileProvider) {
        this.extCtx.subscriptions.push(window.registerTerminalProfileProvider(`${EXTENSION_ID}.${name}`, provider))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private registerCommand(name: string, callback: (...args: any) => any | Promise<void>) {
        this.extCtx.subscriptions.push(
            commands.registerCommand(`${EXTENSION_ID}.${name}`, callback)
        )
    }

    private async handleActiveManifestChanged(manifest: Manifest | null, isLastActive: boolean) {
        if (manifest === null) {
            return
        }

        if (!isLastActive) {
            await this.buildPipeline.stop()
            await this.buildPipeline.resetState()

            await manifest.deleteRepoDir()
            await unloadIntegrations(manifest)
        }

        await this.buildPipeline.ensureState()
    }
}

let extension: Extension | undefined

export async function activate(extCtx: ExtensionContext): Promise<void> {
    void ensureDocumentsPortal()

    console.log(`is VSCode running in sandbox: ${IS_SANDBOXED.toString()}`)

    extension = new Extension(extCtx)
    await extension.activate()

    await appendWatcherExclude(['.flatpak/**', '_build/**'])
}

export async function deactivate(): Promise<void> {
    await extension?.deactivate()
    extension = undefined
}
