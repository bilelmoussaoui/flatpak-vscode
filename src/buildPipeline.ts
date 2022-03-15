import { ManifestManager } from './manifestManager'
import { WorkspaceState } from './workspaceState'
import { Runner } from './runner'
import { TaskMode } from './taskMode'
import { OutputTerminal } from './outputTerminal'
import { loadIntegrations } from './integration'
import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'

export class BuildPipeline implements vscode.Disposable {
    private readonly workspaceState: WorkspaceState
    private readonly manifestManager: ManifestManager
    private readonly runner: Runner
    private readonly outputTerminal: OutputTerminal

    constructor(workspaceState: WorkspaceState, manifestManager: ManifestManager) {
        this.workspaceState = workspaceState

        this.outputTerminal = new OutputTerminal()
        this.runner = new Runner(this.outputTerminal)

        this.manifestManager = manifestManager
        this.manifestManager.onDidRequestRebuild(async (manifest) => {
            if (manifest === this.manifestManager.getActiveManifest()) {
                console.log(`Manifest at ${manifest.uri.fsPath} requested a rebuild`)
                await manifest.deleteRepoDir()
                await this.resetState()
            }
        })
    }

    async showOutputTerminal(preserveFocus?: boolean) {
        await this.outputTerminal.show(preserveFocus)
    }

    /**
     * Init the build environment
     */
    async initializeBuild() {
        this.runner.ensureIdle()

        if (this.workspaceState.getInitialized()) {
            console.log('Skipped build initialization. Already initialized.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.runner.execute([activeManifest.initBuild()], TaskMode.buildInit)
            await loadIntegrations(activeManifest)
        })

        await this.workspaceState.setInitialized(true)
    }

    /**
     * Update the application's dependencies
     */
    async updateDependencies() {
        this.runner.ensureIdle()

        if (!this.workspaceState.getInitialized()) {
            console.log('Did not run updateDependencies. Build is not initialized.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.runner.execute([activeManifest.updateDependencies()], TaskMode.updateDeps)
        })

        await this.workspaceState.setDependenciesUpdated(true)
        // Assume user might want to rebuild dependencies
        await this.workspaceState.setDependenciesBuilt(false)
    }

    /**
     * Build the application's dependencies
     */
    async buildDependencies() {
        this.runner.ensureIdle()

        if (this.workspaceState.getDependenciesBuilt()) {
            console.log('Skipped buildDependencies. Dependencies are already built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.runner.execute([activeManifest.buildDependencies()], TaskMode.buildDeps)
        })

        await this.workspaceState.setDependenciesBuilt(true)
    }

    async buildApplication() {
        this.runner.ensureIdle()

        if (!this.workspaceState.getDependenciesBuilt()) {
            console.log('Cannot build application; dependencies are not built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.runner.execute(activeManifest.build(false), TaskMode.buildApp)
        })

        await this.workspaceState.setApplicationBuilt(true)
    }

    async rebuildApplication() {
        this.runner.ensureIdle()

        if (!this.workspaceState.getApplicationBuilt()) {
            console.log('Skipped rebuild. The application was not built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.runner.execute(activeManifest.build(true), TaskMode.rebuild)
        })

        await this.workspaceState.setApplicationBuilt(true)
    }

    /**
     * A helper method to chain up commands based on current pipeline state
     */
    async build() {
        this.runner.ensureIdle()

        await this.initializeBuild()

        if (!this.workspaceState.getDependenciesUpdated()) {
            await this.updateDependencies()
        }

        await this.buildDependencies()

        if (this.workspaceState.getApplicationBuilt()) {
            await this.rebuildApplication()
        } else {
            await this.buildApplication()
        }
    }

    /**
     * Run the application, only if it was already built
     */
    async run() {
        this.runner.ensureIdle()

        if (!this.workspaceState.getApplicationBuilt()) {
            console.log('Skipped run; the application is not built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.runner.execute([activeManifest.run()], TaskMode.run)
            this.outputTerminal.appendMessage('Application exited')
        })
    }

    /**
     * Export a Flatpak bundle, only if the application was already built
     */
    async exportBundle() {
        this.runner.ensureIdle()

        if (!this.workspaceState.getApplicationBuilt()) {
            console.log('Skipped exportBundle. Application is not built.')
            return
        }

        await this.manifestManager.doWithActiveManifest(async (activeManfiest) => {
            await this.runner.execute(await activeManfiest.bundle(), TaskMode.export)
        })

        void vscode.window.showInformationMessage('Flatpak bundle has been exported successfully.', 'Show bundle')
            .then((response) => {
                if (response !== 'Show bundle') {
                    return
                }

                const activeManifest = this.manifestManager.getActiveManifest()
                if (activeManifest !== null) {
                    void vscode.env.openExternal(vscode.Uri.file(activeManifest.workspace))
                }
            })
    }

    /**
     * Clean build environment
     */
    async clean() {
        this.runner.ensureIdle()

        await this.manifestManager.doWithActiveManifest(async (activeManifest) => {
            await this.outputTerminal.show(true)

            await activeManifest.deleteRepoDir()
            this.outputTerminal.appendMessage('Deleted Flatpak repository directory')

            const buildSystemDir = activeManifest.buildSystemBuildDir()
            if (buildSystemDir) {
                await fs.rmdir(path.join(activeManifest.workspace, buildSystemDir), {
                    recursive: true
                })
                this.outputTerminal.appendMessage(`Deleted ${buildSystemDir} directory`)
            }

            await this.resetState()
            this.outputTerminal.appendMessage('Pipeline state reset')
        })
    }

    /**
     * Clear and stop the running commands in the runner
     */
    async stop() {
        await this.runner.stop()
    }

    async resetState() {
        await this.workspaceState.setInitialized(false)
        await this.workspaceState.setDependenciesUpdated(false)
        await this.workspaceState.setDependenciesBuilt(false)
        await this.workspaceState.setApplicationBuilt(false)
    }

    async dispose() {
        this.outputTerminal.dispose()
        await this.runner.dispose()
    }
}
