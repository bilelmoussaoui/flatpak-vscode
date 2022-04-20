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
import { loadIntegrations, unloadIntegrations } from './integration'
import { RunnerError } from './runner'

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

        this.buildPipeline = new BuildPipeline(this.workspaceState)
        this.extCtx.subscriptions.push(this.buildPipeline)

        this.manifestManager.onDidRequestRebuild(async (manifest) => {
            if (this.manifestManager.isActiveManifest(manifest)) {
                console.log(`Manifest at ${manifest.uri.fsPath} requested a rebuild`)
                await manifest.deleteRepoDir()
                await this.buildPipeline.resetState()
            }
        })
    }

    async activate() {
        await migrateStateToMemento(this.workspaceState)
        await this.workspaceState.loadContexts()

        // Private commands
        this.registerCommand('show-active-manifest', async () => {
            const activeManifest = await this.manifestManager.getActiveManifest(false)
            await vscode.window.showTextDocument(activeManifest.uri)
        })

        // Public commands
        this.registerCommand('select-manifest', async () => {
            await this.manifestManager.selectManifest()
        })

        this.registerCommand('runtime-terminal', async () => {
            const activeManifest = await this.manifestManager.getActiveManifest()
            const runtimeTerminal = window.createTerminal(activeManifest.runtimeTerminal())
            this.extCtx.subscriptions.push(runtimeTerminal)
            runtimeTerminal.show()
        })

        this.registerCommand('build-terminal', async () => {
            const activeManifest = await this.manifestManager.getActiveManifest()
            const buildTerminal = window.createTerminal(activeManifest.buildTerminal())
            this.extCtx.subscriptions.push(buildTerminal)
            buildTerminal.show()
        })

        this.registerCommand('show-output-terminal', async () => {
            await this.buildPipeline.showOutputTerminal()
        })

        this.registerCommand(TaskMode.updateDeps, async () => {
            const activeManifest = await this.manifestManager.getActiveManifest()
            await this.buildPipeline.updateDependencies(activeManifest)
            await this.buildPipeline.buildDependencies(activeManifest)
        })

        this.registerCommand('build-and-run', async () => {
            const activeManifest = await this.manifestManager.getActiveManifest()
            await this.buildPipeline.build(activeManifest)
            await this.buildPipeline.run(activeManifest)
        })

        this.registerCommand(TaskMode.stop, async () => {
            await this.buildPipeline.stop()
        })

        this.registerCommand(TaskMode.clean, async () => {
            const activeManifest = await this.manifestManager.getActiveManifest()
            await this.buildPipeline.clean(activeManifest)
        })

        this.registerCommand(TaskMode.run, async () => {
            const activeManifest = await this.manifestManager.getActiveManifest()
            await this.buildPipeline.run(activeManifest)
        })

        this.registerCommand(TaskMode.export, async () => {
            const activeManifest = await this.manifestManager.getActiveManifest()
            await this.buildPipeline.exportBundle(activeManifest)
        })

        this.registerCommand('build', async () => {
            const activeManifest = await this.manifestManager.getActiveManifest()
            await this.buildPipeline.build(activeManifest)
        })

        this.registerTerminalProfileProvider('runtime-terminal-provider', {
            provideTerminalProfile: async () => {
                const activeManifest = await this.manifestManager.getActiveManifest()
                return new vscode.TerminalProfile(activeManifest.runtimeTerminal())
            }
        })

        this.registerTerminalProfileProvider('build-terminal-provider', {
            provideTerminalProfile: async () => {
                const activeManifest = await this.manifestManager.getActiveManifest()
                await this.buildPipeline.ensureInitializedBuild(activeManifest)
                return new vscode.TerminalProfile(activeManifest.buildTerminal())
            }
        })

        console.log('All commands and terminal profile providers are now registered.')

        await this.manifestManager.loadLastActiveManifest()
    }

    async deactivate() {
        const activeManifest = await this.manifestManager.getActiveManifest()
        await unloadIntegrations(activeManifest)
    }

    private registerTerminalProfileProvider(name: string, provider: vscode.TerminalProfileProvider) {
        this.extCtx.subscriptions.push(window.registerTerminalProfileProvider(`${EXTENSION_ID}.${name}`, provider))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private registerCommand(name: string, callback: (...args: any) => any | Promise<void>) {
        this.extCtx.subscriptions.push(
            commands.registerCommand(`${EXTENSION_ID}.${name}`, async (args) => {
                try {
                    await callback(args)
                } catch (err) {
                    if (err instanceof RunnerError) {
                        return
                    }

                    throw err
                }
            })
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

        await appendWatcherExclude(['.flatpak/**', '_build/**'])

        await this.buildPipeline.ensureInitializedBuild(manifest)
        await loadIntegrations(manifest)
    }
}

let extension: Extension | undefined

export async function activate(extCtx: ExtensionContext): Promise<void> {
    void ensureDocumentsPortal()

    console.log(`is VSCode running in sandbox: ${IS_SANDBOXED.toString()}`)

    extension = new Extension(extCtx)
    await extension.activate()
}

export async function deactivate(): Promise<void> {
    await extension?.deactivate()
    extension = undefined
}
