import * as vscode from 'vscode'

type WorkspaceStateKey =
    // The current manifest URI that directs to active manifest.
    // This is used to retrieve the last active manifest between startup.
    'ActiveManifestUri' |
    // Whether the '.flatpak' directory is present and populated
    'Initialized' |
    // Whether dependencies of the application are up to date
    'DependenciesUpdated' |
    // Whether dependencies of the application are built
    'DependenciesBuilt' |
    // Whether dependencies of the application are built and ready to run
    'ApplicationBuilt'

/**
 * Persistent state within the workspace across startups.
 */
export class WorkspaceState {
    private readonly extCtx: vscode.ExtensionContext

    constructor(extCtx: vscode.ExtensionContext) {
        this.extCtx = extCtx
    }

    async setActiveManifestUri(value: vscode.Uri | undefined): Promise<void> {
        await this.setContext('flatpakManifestFound', value !== undefined)
        await this.update('ActiveManifestUri', value)
    }

    getActiveManifestUri(): vscode.Uri | undefined {
        return this.get('ActiveManifestUri')
    }

    async setInitialized(value: boolean): Promise<void> {
        await this.setContext('flatpakInitialized', value)
        await this.update('Initialized', value)
    }

    getInitialized(): boolean {
        return this.get('Initialized') || false
    }

    async setDependenciesUpdated(value: boolean): Promise<void> {
        await this.update('DependenciesUpdated', value)
    }

    getDependenciesUpdated(): boolean {
        return this.get('DependenciesUpdated') || false
    }

    async setDependenciesBuilt(value: boolean): Promise<void> {
        await this.setContext('flatpakDependenciesBuilt', value)
        await this.update('DependenciesBuilt', value)
    }

    getDependenciesBuilt(): boolean {
        return this.get('DependenciesBuilt') || false
    }

    async setApplicationBuilt(value: boolean): Promise<void> {
        await this.setContext('flatpakApplicationBuilt', value)
        await this.update('ApplicationBuilt', value)
    }

    getApplicationBuilt(): boolean {
        return this.get('ApplicationBuilt') || false
    }

    private async update(key: WorkspaceStateKey, value: vscode.Uri | boolean | undefined) {
        return this.extCtx.workspaceState.update(key, value)
    }

    private get<T>(key: WorkspaceStateKey): T | undefined {
        return this.extCtx.workspaceState.get(key)
    }

    private async setContext(contextName: string, value: boolean): Promise<void> {
        await vscode.commands.executeCommand('setContext', contextName, value)
    }
}
