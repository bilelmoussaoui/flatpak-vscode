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

                // If that manifest is the first valid manifest, select it automatically.
                if (manifests.size() === 1) {
                    console.log(`Found the first valid manifest at ${newManifest.uri.fsPath}. Setting it as active.`)
                    await this.setActiveManifest(newManifest, true)
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
                // left, select that manifest automatically.
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
    }

    async loadLastActiveManifest(): Promise<void> {
        let lastActiveManifestUri = this.workspaceState.getActiveManifestUri()

        if (lastActiveManifestUri !== undefined && !await exists(lastActiveManifestUri.fsPath)) {
            lastActiveManifestUri = undefined
        }

        const manifests = await this.getManifests()

        if (lastActiveManifestUri === undefined) {
            // If there is only one manifest to select, select it automatically.
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

    async getManifests(): Promise<ManifestMap> {
        if (this.manifests === undefined) {
            console.log('Looking for potential Flatpak manifests')
            this.manifests = await findManifests()

            this.tryShowStatusItem()
            this.manifests.onDidItemsChanged(() => {
                this.tryShowStatusItem()
            })
        }

        return this.manifests
    }

    getActiveManifest(): Manifest | null {
        return this.activeManifest
    }

    /**
     * Sets the active manifest
     * @param manifest Manifest to be set
     * @param isLastActive Whether if the manifest was loaded from stored ActiveManifestUri
     */
    private async setActiveManifest(manifest: Manifest | null, isLastActive: boolean): Promise<void> {
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
    async selectManifest(): Promise<Manifest | null> {
        const manifests = await this.getManifests()

        if (manifests.isEmpty()) {
            void vscode.window.showInformationMessage('No Flatpak manifest found in this workspace.')
            return null
        }

        const quickPickItems: ManifestQuickPickItem[] = []
        const activeManifest = this.getActiveManifest()
        manifests.forEach((manifest) => {
            const labelPrefix = manifest.uri.fsPath === activeManifest?.uri.fsPath
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

    /**
     * Convenience function to do things with the active manifest if it exist.
     * If it doesn't exist. Show manifests picker, or show messages.
     * @param func Callback function where the active manifest can be handled
     */
    async doWithActiveManifest(func: (manifest: Manifest) => Promise<void> | void, checkForError = true): Promise<void> {
        let activeManifest = this.getActiveManifest()

        if (activeManifest === null) {
            const selectedManifest = await this.selectManifest()
            if (selectedManifest === null) {
                void vscode.window.showInformationMessage('No Flatpak manifest was selected.')
                return
            }
            activeManifest = selectedManifest
        }

        if (checkForError) {
            const manifestError = activeManifest.checkForError()
            if (manifestError !== null) {
                void vscode.window.showWarningMessage(`Active Flatpak manifest has error: ${manifestError.message}`)
                return
            }
        }

        await func(activeManifest)
    }

    private tryShowStatusItem() {
        if (this.manifests !== undefined && !this.manifests.isEmpty()) {
            this.statusItem.show()
        }
    }

    private updateStatusItem() {
        const activeManifest = this.getActiveManifest()
        const manifestError = activeManifest?.checkForError() || null

        if (activeManifest === null) {
            this.statusItem.text = '$(package)  No active manifest'
            this.statusItem.command = `${EXTENSION_ID}.select-manifest`
            this.statusItem.tooltip = 'Select manifest'
            this.statusItem.color = undefined
        } else if (manifestError !== null) {
            this.statusItem.text = `$(package)  ${activeManifest.id()}`
            this.statusItem.command = `${EXTENSION_ID}.show-active-manifest`
            this.statusItem.tooltip = manifestError.message
            this.statusItem.color = new vscode.ThemeColor('notificationsErrorIcon.foreground')
        } else {
            this.statusItem.text = `$(package)  ${activeManifest.id()}`
            this.statusItem.command = `${EXTENSION_ID}.show-active-manifest`
            this.statusItem.tooltip = activeManifest.uri.fsPath
            this.statusItem.color = undefined
        }
    }

    dispose(): void {
        this.statusItem.dispose()
        this.manifestWatcher.dispose()
    }
}
