// TODO remove in next releases

import * as vscode from 'vscode'
import { WorkspaceState } from './workspaceState'
import * as fs from 'fs/promises'
import { exists } from './utils'

interface LegacyState {
    selectedManifest: { uri: vscode.Uri } | null
    pipeline: {
        initialized: boolean
        dependencies: {
            updated: boolean
            built: boolean
        }
        application: {
            built: boolean
        }
    }
}

/**
 * Migrate persistent workspace state from the use of `pipeline.json` to Memento API
 * @param workspaceState Instance of the workspace state
 */
export async function migrateStateToMemento(workspaceState: WorkspaceState): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders

    if (workspaceFolders === undefined) {
        return
    }

    const stateFileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.flatpak', 'pipeline.json')

    if (!await exists(stateFileUri.fsPath)) {
        return
    }

    try {
        const stateFile = await vscode.workspace.openTextDocument(stateFileUri)
        const legacyState = JSON.parse(stateFile.getText()) as LegacyState

        if (legacyState.selectedManifest === null) {
            // There was no selected manifest so it doesn't makes sense to restore state.
            return
        }

        if (!await exists(legacyState.selectedManifest.uri.path)) {
            // If the old selected manifest doesn't exist anymore, it doesn't make
            // sense either to restore state.
            return
        }

        await workspaceState.setActiveManifestUri(legacyState.selectedManifest.uri)
        await workspaceState.setInitialized(legacyState.pipeline.initialized)
        await workspaceState.setDependenciesUpdated(legacyState.pipeline.dependencies.updated)
        await workspaceState.setDependenciesBuilt(legacyState.pipeline.dependencies.built)
        await workspaceState.setApplicationBuilt(legacyState.pipeline.application.built)

        await fs.rm(stateFileUri.fsPath)

        console.info('Successfully migrated from `pipeline.json` to `Memento`')
    } catch (err) {
        console.warn(`Failed to migrate to memento: ${err as string}`)
    }
}
