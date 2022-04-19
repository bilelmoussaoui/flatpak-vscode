import { WorkspaceState } from './workspaceState'
import { Runner } from './runner'
import { TaskMode } from './taskMode'
import { OutputTerminal } from './outputTerminal'
import { loadIntegrations } from './integration'
import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { Manifest } from './manifest'
import { exists } from './utils'

export class BuildPipeline implements vscode.Disposable {
    private readonly workspaceState: WorkspaceState
    private readonly runner: Runner
    private readonly outputTerminal: OutputTerminal

    constructor(workspaceState: WorkspaceState) {
        this.workspaceState = workspaceState

        this.outputTerminal = new OutputTerminal()
        this.runner = new Runner(this.outputTerminal)
    }

    async showOutputTerminal(preserveFocus?: boolean) {
        await this.outputTerminal.show(preserveFocus)
    }

    /**
     * Init the build environment
     */
    async initializeBuild(manifest: Manifest) {
        this.runner.ensureIdle()

        if (this.workspaceState.getInitialized()) {
            console.log('Skipped build initialization. Already initialized.')
            return
        }

        await this.runner.execute([manifest.initBuild()], TaskMode.buildInit)
        await loadIntegrations(manifest)

        await this.workspaceState.setInitialized(true)
    }

    /**
     * Update the application's dependencies
     */
    async updateDependencies(manifest: Manifest) {
        this.runner.ensureIdle()

        if (!this.workspaceState.getInitialized()) {
            console.log('Did not run updateDependencies. Build is not initialized.')
            return
        }

        await this.runner.execute([manifest.updateDependencies()], TaskMode.updateDeps)

        await this.workspaceState.setDependenciesUpdated(true)
        // Assume user might want to rebuild dependencies
        await this.workspaceState.setDependenciesBuilt(false)
    }

    /**
     * Build the application's dependencies
     */
    async buildDependencies(manifest: Manifest) {
        this.runner.ensureIdle()

        if (this.workspaceState.getDependenciesBuilt()) {
            console.log('Skipped buildDependencies. Dependencies are already built.')
            return
        }

        await this.runner.execute([manifest.buildDependencies()], TaskMode.buildDeps)

        await this.workspaceState.setDependenciesBuilt(true)
    }

    async buildApplication(manifest: Manifest) {
        this.runner.ensureIdle()

        if (!this.workspaceState.getDependenciesBuilt()) {
            console.log('Cannot build application; dependencies are not built.')
            return
        }

        await this.runner.execute(manifest.build(false), TaskMode.buildApp)

        await this.workspaceState.setApplicationBuilt(true)
    }

    async rebuildApplication(manifest: Manifest) {
        this.runner.ensureIdle()

        if (!this.workspaceState.getApplicationBuilt()) {
            console.log('Skipped rebuild. The application was not built.')
            return
        }

        await this.runner.execute(manifest.build(true), TaskMode.rebuild)

        await this.workspaceState.setApplicationBuilt(true)
    }

    /**
     * A helper method to chain up commands based on current pipeline state
     */
    async build(manifest: Manifest) {
        this.runner.ensureIdle()

        await this.initializeBuild(manifest)

        if (!this.workspaceState.getDependenciesUpdated()) {
            await this.updateDependencies(manifest)
        }

        await this.buildDependencies(manifest)

        if (this.workspaceState.getApplicationBuilt()) {
            await this.rebuildApplication(manifest)
        } else {
            await this.buildApplication(manifest)
        }
    }

    /**
     * Run the application, only if it was already built
     */
    async run(manifest: Manifest) {
        this.runner.ensureIdle()

        if (!this.workspaceState.getApplicationBuilt()) {
            console.log('Skipped run; the application is not built.')
            return
        }

        await this.runner.execute([manifest.run()], TaskMode.run)
        this.outputTerminal.appendMessage('Application exited')
    }

    /**
     * Export a Flatpak bundle, only if the application was already built
     */
    async exportBundle(manifest: Manifest) {
        this.runner.ensureIdle()

        if (!this.workspaceState.getApplicationBuilt()) {
            console.log('Skipped exportBundle. Application is not built.')
            return
        }

        await this.runner.execute(await manifest.bundle(), TaskMode.export)

        void vscode.window.showInformationMessage('Flatpak bundle has been exported successfully.', 'Show bundle')
            .then((response) => {
                if (response !== 'Show bundle') {
                    return
                }

                void vscode.env.openExternal(vscode.Uri.file(manifest.workspace))
            })
    }

    /**
     * Clean build environment
     */
    async clean(manifest: Manifest) {
        this.runner.ensureIdle()

        await this.outputTerminal.show(true)

        await manifest.deleteRepoDir()
        this.outputTerminal.appendMessage('Deleted Flatpak repository directory')

        const buildSystemDir = manifest.buildSystemBuildDir()
        if (buildSystemDir) {
            const buildDir = path.join(manifest.workspace, buildSystemDir)
            if (await exists(buildDir)) {
                await fs.rmdir(buildDir, {
                    recursive: true
                })
            }
            this.outputTerminal.appendMessage(`Deleted ${buildSystemDir} directory`)
        }

        await this.resetState()
        this.outputTerminal.appendMessage('Pipeline state reset')
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
