import { Manifest } from './manifest'
import { exists } from './utils'
import * as fs from 'fs/promises'
import * as vscode from 'vscode'
import { WorkspaceState } from './workspaceState'
import { EXTENSION_ID } from './extension'
import { isDeepStrictEqual } from 'util'
import { ManifestMap } from './manifestMap'
import { findManifests, MANIFEST_PATH_GLOB_PATTERN, parseManifest } from './manifestUtils'

interface ManifestQuickPickItem {
    label: string,
    detail: string,
    manifest: Manifest
}

export class ManifestManager implements vscode.Disposable {
    private readonly statusItem: vscode.StatusBarItem
    private readonly workspaceState: WorkspaceState
    private readonly manifestWatcher: vscode.FileSystemWatcher
    private manifests?: ManifestMap
    private activeManifest: Manifest | null

    private readonly _onDidActiveManifestChanged = new vscode.EventEmitter<[Manifest | null, boolean]>()
    readonly onDidActiveManifestChanged = this._onDidActiveManifestChanged.event

    private readonly _onDidRequestRebuild = new vscode.EventEmitter<Manifest>()
    readonly onDidRequestRebuild = this._onDidRequestRebuild.event

    constructor(workspaceState: WorkspaceState) {
        this.workspaceState = workspaceState
        this.activeManifest = null

        this.manifestWatcher = vscode.workspace.createFileSystemWatcher(MANIFEST_PATH_GLOB_PATTERN)
        this.manifestWatcher.onDidCreate(async (newUri) => {
            console.log(`Possible manifest created at ${newUri.fsPath}`)

            try {
                const newManifest = await parseManifest(newUri)
                if (newManifest === null) {
                    return
                }

                const manifests = await this.getManifests()
                manifests.add(newManifest)
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
        })

        this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
        this.updateStatusItem()
    }

    async loadLastActiveManifest(): Promise<void> {
        let lastActiveManifestUri = this.workspaceState.getActiveManifestUri()

        if (lastActiveManifestUri !== undefined && !await exists(lastActiveManifestUri.fsPath)) {
            lastActiveManifestUri = undefined
        }

        if (lastActiveManifestUri === undefined) {
            const defaultManifest = await this.findDefaultManifest()
            if (defaultManifest !== undefined) {
                console.log(`Manifest set as default at ${defaultManifest.uri.fsPath}`)
                await this.setActiveManifest(defaultManifest, true)
            }
            return
        }

        const manifests = await this.getManifests()
        const lastActiveManifest = manifests.get(lastActiveManifestUri)
        if (lastActiveManifest === undefined) {
            return
        }

        console.log(`Found last active manifest uri at ${lastActiveManifestUri.fsPath}`)
        await this.setActiveManifest(lastActiveManifest, true)
    }

    async findDefaultManifest(): Promise<Manifest | undefined> {
        const manifests = await this.getManifests()

        // If there is only one manifest to select, select it automatically.
        const firstManifest = manifests.getFirstItem()
        if (manifests.size() === 1 && firstManifest) {
            console.log('Found only one valid manifest')
            return firstManifest
        }

        // If some manifest contains '.Devel.' in its filename, select it automatically.
        for (const manifest of manifests) {
            if (manifest.uri.fsPath.includes('.Devel.')) {
                console.log('Found a manifest that contains ".Devel." in its filename')
                return manifest
            }
        }

        return undefined
    }

    async getManifests(): Promise<ManifestMap> {
        if (this.manifests === undefined) {
            console.log('Looking for potential Flatpak manifests')
            this.manifests = await findManifests()

            this.tryShowStatusItem()
            this.manifests.onDidItemsChanged(() => {
                this.tryShowStatusItem()
            })
            this.manifests.onDidItemAdded(async (manifest) => {
                // If that manifest is the first valid manifest, select it automatically.
                if (this.manifests!.size() === 1) {
                    console.log(`Found the first valid manifest at ${manifest.uri.fsPath}. Setting it as active.`)
                    await this.setActiveManifest(manifest, true)
                }
            })
            this.manifests.onDidItemDeleted(async (deletedUri) => {
                if (deletedUri.fsPath === this.activeManifest?.uri.fsPath) {
                    // If current active manifest is deleted and there is only one manifest
                    // left, select that manifest automatically.
                    const firstManifest = this.manifests!.getFirstItem()
                    if (this.manifests!.size() === 1 && firstManifest) {
                        console.log(`Found only one valid manifest. Setting active manifest to ${firstManifest.uri.fsPath}`)
                        await this.setActiveManifest(firstManifest, false)
                    } else {
                        await this.setActiveManifest(null, false)
                    }
                }
            })
        }

        return this.manifests
    }

    /**
     * Like `getActiveManifestUnchecked` but throws an error when the active manifest contains error.
     *
     * @returns active manifest
     */
    async getActiveManifest(): Promise<Manifest> {
        const manifest = await this.getActiveManifestUnchecked()

        const error = manifest.checkForError()
        if (error !== null) {
            throw Error(`Active Flatpak manifest has error: ${error.message}`)
        }

        return manifest
    }

    /**
     * Convenience function to get the active manifest and try handle if it doesn't exist.
     *
     * This throws an error if a null active manifest is unhandled.
     *
     * @returns active manifest
     */
    async getActiveManifestUnchecked(): Promise<Manifest> {
        let ret = this.activeManifest

        if (ret === null) {
            const selectedManifest = await this.selectManifest()
            if (selectedManifest === null) {
                throw Error('No Flatpak manifest was selected.')
            }
            ret = selectedManifest
        }

        return ret
    }

    isActiveManifest(manifest: Manifest | null): boolean {
        return isDeepStrictEqual(this.activeManifest, manifest)
    }

    /**
     * Sets the active manifest
     * @param manifest Manifest to be set
     * @param isLastActive Whether if the manifest was loaded from stored ActiveManifestUri
     */
    private async setActiveManifest(manifest: Manifest | null, isLastActive: boolean): Promise<void> {
        if (this.isActiveManifest(manifest)) {
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
        await fs.mkdir(manifest.buildDir, { recursive: true })
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

            // The path has not changed so this will only update the content of
            // the manifest.
            manifests.add(updatedManifest)

            if (uri.fsPath === this.activeManifest?.uri.fsPath) {
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
     *
     * Throws an error if there are no discovered manifests
     *
     * @returns the selected manifest
     */
    async selectManifest(): Promise<Manifest | null> {
        const manifests = await this.getManifests()

        if (manifests.isEmpty()) {
            throw Error('No Flatpak manifest found in this workspace.')
        }

        const quickPickItems: ManifestQuickPickItem[] = []
        manifests.forEach((manifest) => {
            const labelPrefix = manifest.uri.fsPath === this.activeManifest?.uri.fsPath
                ? '$(pass-filled)' : '$(circle-large-outline)'

            quickPickItems.push({
                label: `${labelPrefix}  ${manifest.id()}`,
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

    private tryShowStatusItem() {
        if (this.manifests !== undefined && !this.manifests.isEmpty()) {
            this.statusItem.show()
        }
    }

    private updateStatusItem() {
        const manifestError = this.activeManifest?.checkForError() || null

        if (this.activeManifest === null) {
            this.statusItem.text = '$(package)  No active manifest'
            this.statusItem.command = `${EXTENSION_ID}.select-manifest`
            this.statusItem.tooltip = 'Select manifest'
            this.statusItem.color = undefined
        } else if (manifestError !== null) {
            this.statusItem.text = `$(package)  ${this.activeManifest.id()}`
            this.statusItem.command = `${EXTENSION_ID}.show-active-manifest`
            this.statusItem.tooltip = manifestError.message
            this.statusItem.color = new vscode.ThemeColor('notificationsErrorIcon.foreground')
        } else {
            this.statusItem.text = `$(package)  ${this.activeManifest.id()}`
            this.statusItem.command = `${EXTENSION_ID}.show-active-manifest`
            this.statusItem.tooltip = this.activeManifest.uri.fsPath
            this.statusItem.color = undefined
        }
    }

    dispose(): void {
        this.statusItem.dispose()
        this.manifestWatcher.dispose()
    }
}
