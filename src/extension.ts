import * as vscode from 'vscode'
import { window, ExtensionContext, commands } from 'vscode'
import { existsSync } from 'fs'
import { ensureDocumentsPortal, appendWatcherExclude } from './utils'
import { FinishedTask, Runner } from './runner'
import { TaskMode } from './taskMode'
import { loadIntegrations, unloadIntegrations } from './integration'
import { OutputTerminal } from './outputTerminal'
import { ManifestManager } from './manifestManager'
import { Manifest } from './manifest'
import { WorkspaceState } from './workspaceState'
import { migrateStateToMemento } from './migration'

export const EXTENSION_ID = 'flatpak-vscode'

/**
 * Whether VSCode is installed in a sandbox
 */
export const IS_SANDBOXED = existsSync('/.flatpak-info')

class Extension {
    private readonly extCtx: vscode.ExtensionContext
    private readonly workspaceState: WorkspaceState
    private readonly outputTerminal: OutputTerminal
    private readonly runner: Runner
    private readonly manifestManager: ManifestManager

    constructor(extCtx: vscode.ExtensionContext) {
        this.extCtx = extCtx
        this.workspaceState = new WorkspaceState(extCtx)

        this.manifestManager = new ManifestManager(this.workspaceState)
        this.extCtx.subscriptions.push(this.manifestManager)
        this.manifestManager.onDidActiveManifestChanged(async ([manifest, isLastActive]) => {
            await this.handleActiveManifestChanged(manifest, isLastActive)
        })
        this.manifestManager.onDidRequestRebuild(async (manifest) => {
            if (manifest === this.manifestManager.getActiveManifest()) {
                console.log(`Manifest at ${manifest.uri.fsPath} requested a rebuild`)
                await this.executeCommand(TaskMode.clean)
            }
        })

        this.outputTerminal = new OutputTerminal()
        this.extCtx.subscriptions.push(this.outputTerminal)

        this.runner = new Runner(this.outputTerminal)
        this.extCtx.subscriptions.push(this.runner)
        this.runner.onDidFinishedTask(async (finishedTask) => {
            await this.handleFinishedTask(finishedTask)
        })
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
            await this.outputTerminal.show(true)
        })

        // Init the build environment
        this.registerCommand(TaskMode.buildInit, async (completeBuild: boolean | undefined) => {
            this.runner.completeBuild = completeBuild || false
            if (this.workspaceState.getInitialized()) {
                return
            }
            await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
                await this.outputTerminal.show(true)
                await this.runner.setCommands([activeManifest.initBuild()], TaskMode.buildInit)
            })
        })

        // Update the application's dependencies
        this.registerCommand(TaskMode.updateDeps, async (completeBuild: boolean | undefined) => {
            this.runner.completeBuild = completeBuild || false
            if (!this.workspaceState.getInitialized()) {
                return
            }
            await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
                await this.outputTerminal.show(true)
                await this.runner.setCommands(
                    [activeManifest.updateDependencies()],
                    TaskMode.updateDeps
                )
            })
        })

        // Build the application's dependencies
        this.registerCommand(TaskMode.buildDeps, async (completeBuild: boolean | undefined) => {
            this.runner.completeBuild = completeBuild || false
            if (this.workspaceState.getDependenciesBuilt()) {
                return
            }
            await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
                await this.outputTerminal.show(true)
                await this.runner.setCommands(
                    [activeManifest.buildDependencies()],
                    TaskMode.buildDeps
                )
            })
        })

        // Build the application
        this.registerCommand(TaskMode.buildApp, async () => {
            if (!this.workspaceState.getDependenciesBuilt()) {
                return
            }
            await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
                await this.outputTerminal.show(true)
                await this.runner.setCommands(activeManifest.build(false), TaskMode.buildApp)
            })
        })

        // Rebuild the application
        // If a buildsystem is set on the latest module, the build/rebuild commands
        // could be different, the rebuild also triggers a run command afterwards
        this.registerCommand(TaskMode.rebuild, async () => {
            if (!this.workspaceState.getApplicationBuilt()) {
                void vscode.window.showWarningMessage('Please run a Flatpak build command first.')
                return
            }
            await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
                await this.outputTerminal.show(true)
                await this.runner.setCommands(activeManifest.build(true), TaskMode.rebuild)
            })
        })

        this.registerCommand(TaskMode.stop, async () => {
            await this.outputTerminal.show(true)
            this.runner.close()
        })

        // Clean build environment
        this.registerCommand(TaskMode.clean, async () => {
            if (!this.workspaceState.getInitialized()) {
                return
            }
            await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
                await this.outputTerminal.show(true)
                await activeManifest.deleteRepoDir()
                await this.resetPipelineState()
                await this.executeCommand(TaskMode.buildInit)
            })
        })

        // Run the application, only if it was already built
        this.registerCommand(TaskMode.run, async () => {
            if (!this.workspaceState.getApplicationBuilt()) {
                return
            }
            await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
                await this.outputTerminal.show(true)
                await this.runner.setCommands([activeManifest.run()], TaskMode.run)
            })
        })

        // A helper command, chains up to other commands based on current pipeline state
        this.registerCommand('build', async () => {
            this.runner.completeBuild = true
            if (!this.workspaceState.getInitialized()) {
                await this.executeCommand(TaskMode.buildInit)
            } else if (!this.workspaceState.getDependenciesUpdated()) {
                await this.executeCommand(TaskMode.updateDeps)
            } else if (!this.workspaceState.getDependenciesBuilt()) {
                await this.executeCommand(TaskMode.buildDeps)
            } else if (!this.workspaceState.getApplicationBuilt()) {
                await this.executeCommand(TaskMode.buildApp)
            } else {
                this.outputTerminal.appendMessage('Nothing to do')
            }
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private executeCommand(name: string, ...args: any[]): Thenable<unknown> {
        return commands.executeCommand(`${EXTENSION_ID}.${name}`, args)
    }

    private async handleActiveManifestChanged(manifest: Manifest | null, isLastActive: boolean) {
        if (manifest === null) {
            return
        }

        if (!isLastActive) {
            this.runner.close()
            await this.resetPipelineState()

            await manifest.deleteRepoDir()
            await unloadIntegrations(manifest)
        }

        await this.ensurePipelineState()
    }

    private async resetPipelineState(): Promise<void> {
        await this.workspaceState.setInitialized(false)
        await this.workspaceState.setDependenciesUpdated(false)
        await this.workspaceState.setDependenciesBuilt(false)
        await this.workspaceState.setApplicationBuilt(false)
    }

    private async ensurePipelineState(): Promise<void> {
        // Trigger finished task so we update the context
        if (this.workspaceState.getInitialized()) {
            await this.handleFinishedTask({ mode: TaskMode.buildInit, restore: true, completeBuild: false })
        }
        if (this.workspaceState.getDependenciesUpdated()) {
            await this.handleFinishedTask({ mode: TaskMode.updateDeps, restore: true, completeBuild: false })
        }
        if (this.workspaceState.getDependenciesBuilt()) {
            await this.handleFinishedTask({ mode: TaskMode.buildDeps, restore: true, completeBuild: false })
        }
        if (this.workspaceState.getApplicationBuilt()) {
            await this.handleFinishedTask({ mode: TaskMode.buildApp, restore: true, completeBuild: false })
        }
    }

    private async handleFinishedTask(finishedTask: FinishedTask): Promise<void> {
        switch (finishedTask.mode) {
            case TaskMode.buildInit: {
                await this.workspaceState.setInitialized(true)
                const activeManifest = this.manifestManager.getActiveManifest()
                if (activeManifest) {
                    await loadIntegrations(activeManifest)
                }
                if (!finishedTask.restore) {
                    await this.executeCommand(TaskMode.updateDeps, finishedTask.completeBuild)
                }
                break
            }
            case TaskMode.updateDeps:
                await this.workspaceState.setDependenciesUpdated(true)
                // Assume user might want to rebuild dependencies
                await this.workspaceState.setDependenciesBuilt(false)
                if (!finishedTask.restore) {
                    await this.executeCommand(TaskMode.buildDeps, finishedTask.completeBuild)
                }
                break
            case TaskMode.buildDeps:
                await this.workspaceState.setDependenciesBuilt(true)
                if (!finishedTask.restore && finishedTask.completeBuild) {
                    await this.executeCommand(TaskMode.buildApp)
                }
                break
            case TaskMode.buildApp:
                await this.workspaceState.setApplicationBuilt(true)
                break
            case TaskMode.rebuild:
                await this.workspaceState.setApplicationBuilt(true)
                if (!finishedTask.restore) {
                    await this.executeCommand(TaskMode.run)
                }
                break
        }
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
