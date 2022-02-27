import { FlatpakManifest } from './flatpakManifest'
import { exists } from './utils'
import { promises as fs } from 'fs'
import * as vscode from 'vscode'
import { WorkspaceState } from './workspaceState'
import { EXT_ID } from './extension'
import { isDeepStrictEqual } from 'util'
import { FlatpakManifestMap } from './flatpakManifestMap'
import { findManifests, MANIFEST_PATH_GLOB_PATTERN, parseManifest } from './flatpakManifestUtils'

export interface ManifestQuickPickItem {
    label: string,
    detail: string,
    manifest: FlatpakManifest
}

export class FlatpakManifestManager implements vscode.Disposable {
    private readonly statusItem: vscode.StatusBarItem
    private readonly workspaceState: WorkspaceState
    private readonly manifestWatcher: vscode.FileSystemWatcher
    private manifests?: FlatpakManifestMap
    private activeManifest: FlatpakManifest | null

    private readonly _onDidActiveManifestChanged = new vscode.EventEmitter<[FlatpakManifest | null, boolean]>()
    readonly onDidActiveManifestChanged = this._onDidActiveManifestChanged.event

    private readonly _onDidRequestRebuild = new vscode.EventEmitter<FlatpakManifest>()
    readonly onDidRequestRebuild = this._onDidRequestRebuild.event

    constructor(workspaceState: WorkspaceState) {
        this.workspaceState = workspaceState
        this.activeManifest = null

        this.manifestWatcher = vscode.workspace.createFileSystemWatcher(MANIFEST_PATH_GLOB_PATTERN)
        this.manifestWatcher.onDidCreate(async (newUri) => {
            console.log(`Possible manifest created at ${newUri.fsPath}`)

            try {
                const newManifest = await parseManifest(newUri)
                if (newManifest !== null) {
                    const manifests = await this.getManifests()
                    manifests.add(newManifest)
                }
            } catch (err) {
                console.warn(`Failed to parse manifest at ${newUri.fsPath}`)
            }
        })
        this.manifestWatcher.onDidChange(async (uri) => {
            console.log(`Possible manifest modified at ${uri.fsPath}`)
            await this.updateManifest(uri)
        })
        this.manifestWatcher.onDidDelete(async (deletedUri) => {
            console.log(`Possible manifest deleted at ${deletedUri.fsPath}`)

            const manifests = await this.getManifests()
            manifests.delete(deletedUri)

            if (deletedUri.fsPath === this.getActiveManifest()?.uri.fsPath) {
                // If current active manifest is deleted and there is only one manifest
                // left. Select that manifest automatically.
                const firstManifest = manifests.getFirstItem()
                if (manifests.size() === 1 && firstManifest) {
                    console.log(`Found only one valid manifest. Setting active manifest to ${firstManifest.uri.fsPath}`)
                    await this.setActiveManifest(firstManifest, false)
                } else {
                    await this.setActiveManifest(null, false)
                }
            }
        })

        this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
        this.updateStatusItem()
        this.statusItem.show()
    }

    async loadLastActiveManifest(): Promise<void> {
        let lastActiveManifestUri = this.workspaceState.getActiveManifestUri()

        if (lastActiveManifestUri !== undefined && !await exists(lastActiveManifestUri.fsPath)) {
            lastActiveManifestUri = undefined
        }

        const manifests = await this.getManifests()

        if (lastActiveManifestUri === undefined) {
            // If there is only one manifest to select. Select it automatically.
            const firstManifest = manifests.getFirstItem()
            if (manifests.size() === 1 && firstManifest) {
                console.log(`Found only one valid manifest. Setting active manifest to ${firstManifest.uri.fsPath}`)
                await this.setActiveManifest(firstManifest, true)
            }
            return
        }

        const lastActiveManifest = manifests.get(lastActiveManifestUri)
        if (lastActiveManifest === undefined) {
            return
        }

        console.log(`Found last active manifest uri at ${lastActiveManifestUri.fsPath}`)
        await this.setActiveManifest(lastActiveManifest, true)
    }

    async getManifests(): Promise<FlatpakManifestMap> {
        if (this.manifests === undefined) {
            this.manifests = await findManifests()
        }

        return this.manifests
    }

    getActiveManifest(): FlatpakManifest | null {
        return this.activeManifest
    }

    /**
     * Sets the active manifest
     * @param manifest Manifest to be set
     * @param isLastActive Whether if the manifest was loaded from stored ActiveManifestUri
     */
    private async setActiveManifest(manifest: FlatpakManifest | null, isLastActive: boolean): Promise<void> {
        if (isDeepStrictEqual(this.getActiveManifest(), manifest)) {
            return
        }

        this.activeManifest = manifest
        this._onDidActiveManifestChanged.fire([manifest, isLastActive])

        console.log(`Current active manifest: ${manifest?.uri.fsPath || 'null'}`)

        await this.workspaceState.setActiveManifestUri(manifest?.uri)

        this.updateStatusItem()

        if (manifest === null) {
            return
        }

        // Ensure that build directory of active manifest exists
        if (!(await exists(manifest.buildDir))) {
            await fs.mkdir(manifest.buildDir)
        }
    }

    /**
     * Update the manifest at the specified uri
     * @param uri Where the concerned manifest is stored
     */
    private async updateManifest(uri: vscode.Uri) {
        const manifests = await this.getManifests()
        const oldManifest = manifests.get(uri)

        if (oldManifest === undefined) {
            return
        }

        try {
            const updatedManifest = await parseManifest(uri)
            if (updatedManifest === null) {
                return
            }

            manifests.delete(oldManifest.uri)
            manifests.add(updatedManifest)

            if (uri.fsPath === this.getActiveManifest()?.uri.fsPath) {
                await this.setActiveManifest(updatedManifest, false)
            }

            const hasModifiedModules = !isDeepStrictEqual(oldManifest.manifest.modules, updatedManifest.manifest.modules)
            const hasModifiedBuildOptions = !isDeepStrictEqual(oldManifest.manifest['build-options'], updatedManifest.manifest['build-options'])

            if (hasModifiedModules || hasModifiedBuildOptions) {
                console.log('Updated manifest has modified modules or build-options. Requesting a rebuild')
                this._onDidRequestRebuild.fire(updatedManifest)
            }
        } catch (err) {
            console.warn(`Failed to parse manifest at ${uri.fsPath}`)
        }
    }

    /**
     * Update the stored active manifest if user selects something and return the selected manifest.
     * @returns the selected manifest
     */
    async selectManifest(): Promise<FlatpakManifest | null> {
        const quickPickItems: ManifestQuickPickItem[] = []
        const manifests = await this.getManifests()
        manifests.forEach((manifest) => {
            quickPickItems.push({
                label: manifest.id(),
                detail: manifest.uri.fsPath,
                manifest: manifest,
            })
        })

        const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
            canPickMany: false,
            matchOnDescription: true,
            matchOnDetail: true,
        })

        if (selectedItem === undefined) {
            return null
        }

        await this.setActiveManifest(selectedItem.manifest, false)
        return selectedItem.manifest
    }

    /**
     * Convenience function to do things with the active manifest if it exist.
     * If it doesn't exist. Show manifests picker, or show messages.
     * @param func Callback function where the active manifest can be handled
     */
    async doWithActiveManifest(func: (manifest: FlatpakManifest) => Promise<void> | void): Promise<void> {
        let activeManifest = this.getActiveManifest()

        if (activeManifest === null) {
            const manifests = await this.getManifests()
            if (manifests.isEmpty()) {
                void vscode.window.showInformationMessage('No manifest found in this workspace.')
                return
            }
            const selectedManifest = await this.selectManifest()
            if (selectedManifest === null) {
                void vscode.window.showInformationMessage('Selected no manifest.')
                return
            }
            activeManifest = selectedManifest
        }

        await func(activeManifest)
    }

    private updateStatusItem() {
        const activeManifest = this.getActiveManifest()
        const manifestError = activeManifest?.checkForError() || null

        if (activeManifest === null) {
            this.statusItem.text = 'No active manifest'
            this.statusItem.command = `${EXT_ID}.select-manifest`
            this.statusItem.tooltip = 'Select manifest'
            this.statusItem.color = undefined
        } else if (manifestError !== null) {
            this.statusItem.text = activeManifest.id()
            this.statusItem.command = `${EXT_ID}.show-active-manifest`
            this.statusItem.tooltip = manifestError
            this.statusItem.color = new vscode.ThemeColor('notificationsErrorIcon.foreground')
        } else {
            this.statusItem.text = activeManifest.id()
            this.statusItem.command = `${EXT_ID}.show-active-manifest`
            this.statusItem.tooltip = activeManifest.uri.fsPath
            this.statusItem.color = undefined
        }
    }

    dispose(): void {
        this.statusItem.dispose()
        this.manifestWatcher.dispose()
    }
}
