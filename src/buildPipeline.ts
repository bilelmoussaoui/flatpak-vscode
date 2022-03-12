import { ManifestManager } from './manifestManager'
import { WorkspaceState } from './workspaceState'
import { FinishedTask, Runner } from './runner'
import { TaskMode } from './taskMode'
import { OutputTerminal } from './outputTerminal'
import { loadIntegrations } from './integration'
import * as vscode from 'vscode'

export class BuildPipeline implements vscode.Disposable {
    private readonly workspaceState: WorkspaceState
    private readonly manifestManager: ManifestManager
    private readonly runner: Runner
    private readonly outputTerminal: OutputTerminal

    constructor(workspaceState: WorkspaceState, manifestManager: ManifestManager) {
        this.workspaceState = workspaceState

        this.outputTerminal = new OutputTerminal()
        this.runner = new Runner(this.outputTerminal)
        this.runner.onDidFinishedTask(async (finishedTask) => {
            await this.handleFinishedTask(finishedTask)
        })

        this.manifestManager = manifestManager
        this.manifestManager.onDidRequestRebuild(async (manifest) => {
            if (manifest === this.manifestManager.getActiveManifest()) {
                console.log(`Manifest at ${manifest.uri.fsPath} requested a rebuild`)
                await this.clean()
            }
        })
    }

    async showOutputTerminal(preserveFocus?: boolean) {
        await this.outputTerminal.show(preserveFocus)
    }

    /**
     * Init the build environment
     */
    async initializeBuild(completeBuild = false) {
        this.runner.completeBuild = completeBuild

        if (this.workspaceState.getInitialized()) {
            console.log('Skipped build initialization. Already initialized.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.outputTerminal.show(true)
            await this.runner.setCommands([activeManifest.initBuild()], TaskMode.buildInit)
        })
    }

    /**
     * Update the application's dependencies
     */
    async updateDependencies(completeBuild = false) {
        this.runner.completeBuild = completeBuild

        if (!this.workspaceState.getInitialized()) {
            console.log('Did not run updateDependencies. Build is not initialized.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.outputTerminal.show(true)
            await this.runner.setCommands([activeManifest.updateDependencies()], TaskMode.updateDeps)
        })
    }

    /**
     * Build the application's dependencies
     */
    async buildDependencies(completeBuild = false) {
        this.runner.completeBuild = completeBuild

        if (this.workspaceState.getDependenciesBuilt()) {
            console.log('Skipped buildDependencies. Dependencies are already built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.outputTerminal.show(true)
            await this.runner.setCommands(
                [activeManifest.buildDependencies()],
                TaskMode.buildDeps
            )
        })
    }

    async buildApplication() {
        if (!this.workspaceState.getDependenciesBuilt()) {
            console.log('Cannot build application; dependencies are not built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.outputTerminal.show(true)
            await this.runner.setCommands(activeManifest.build(false), TaskMode.buildApp)
        })
    }

    async rebuildApplication() {
        if (!this.workspaceState.getApplicationBuilt()) {
            console.log('Skipped rebuild. The application was not built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.outputTerminal.show(true)
            await this.runner.setCommands(activeManifest.build(true), TaskMode.rebuild)
        })
    }

    /**
     * A helper method to chain up commands based on current pipeline state
     */
    async build() {
        this.runner.completeBuild = true

        if (!this.workspaceState.getInitialized()) {
            await this.initializeBuild()
        } else if (!this.workspaceState.getDependenciesUpdated()) {
            await this.updateDependencies()
        } else if (!this.workspaceState.getDependenciesBuilt()) {
            await this.buildDependencies()
        } else if (!this.workspaceState.getApplicationBuilt()) {
            await this.buildApplication()
        } else {
            this.outputTerminal.appendMessage('Nothing to do')
        }
    }

    /**
     * Run the application, only if it was already built
     */
    async run() {
        if (!this.workspaceState.getApplicationBuilt()) {
            console.log('Skipped run; the application is not built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.outputTerminal.show(true)
            await this.runner.setCommands([activeManifest.run()], TaskMode.run)
        })
    }

    /**
     * Clean build environment
     */
    async clean() {
        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.outputTerminal.show(true)

            await activeManifest.deleteRepoDir()
            this.outputTerminal.appendMessage('Deleted Flatpak repository directory')

            await this.resetState()
            this.outputTerminal.appendMessage('Pipeline state reset')
        })
    }

    /**
     * Clear and stop the running commands in the runner
     */
    async stop() {
        await this.outputTerminal.show(true)
        this.runner.close()
    }

    async resetState() {
        await this.workspaceState.setInitialized(false)
        await this.workspaceState.setDependenciesUpdated(false)
        await this.workspaceState.setDependenciesBuilt(false)
        await this.workspaceState.setApplicationBuilt(false)
    }

    /**
     * Trigger finished task to update context
     */
    async ensureState() {
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

    dispose() {
        this.outputTerminal.dispose()
        this.runner.dispose()
    }

    private async handleFinishedTask(finishedTask: FinishedTask) {
        switch (finishedTask.mode) {
            case TaskMode.buildInit: {
                await this.workspaceState.setInitialized(true)
                const activeManifest = this.manifestManager.getActiveManifest()
                if (activeManifest) {
                    await loadIntegrations(activeManifest)
                }
                if (!finishedTask.restore) {
                    await this.updateDependencies()
                }
                break
            }
            case TaskMode.updateDeps:
                await this.workspaceState.setDependenciesUpdated(true)
                // Assume user might want to rebuild dependencies
                await this.workspaceState.setDependenciesBuilt(false)
                if (!finishedTask.restore) {
                    await this.buildDependencies(finishedTask.completeBuild)
                }
                break
            case TaskMode.buildDeps:
                await this.workspaceState.setDependenciesBuilt(true)
                if (!finishedTask.restore && finishedTask.completeBuild) {
                    await this.buildApplication()
                }
                break
            case TaskMode.buildApp:
                await this.workspaceState.setApplicationBuilt(true)
                break
            case TaskMode.rebuild:
                await this.workspaceState.setApplicationBuilt(true)
                if (!finishedTask.restore) {
                    await this.run()
                }
                break
        }
    }
}
