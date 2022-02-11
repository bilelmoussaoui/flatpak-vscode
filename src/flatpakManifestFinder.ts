import { FlatpakManifest } from './flatpakManifest';
import { FlatpakManifestSchema } from './flatpak.types'
import { Uri, workspace } from 'vscode';
import * as yaml from 'js-yaml'
import { exists } from './utils';

export class FlatpakManifestFinder {
    async find(): Promise<FlatpakManifest[]> {
        const uris: Uri[] = await workspace.findFiles(
            '**/*.{json,yaml,yml}',
            '**/{target,.vscode,.flatpak-builder,flatpak_app,.flatpak}/*',
            1000
        )
        const manifests = []
        for (const uri of uris) {
            try {
                const manifest = await this.parseManifest(uri)
                if (manifest) {
                    manifests.push(manifest)
                }
            } catch (err) {
                console.warn(`Failed to parse the manifest at ${uri.fsPath}`)
            }
        }
        return manifests
    }

    private async parseManifest(uri: Uri): Promise<FlatpakManifest | null> {
        const textDocument = await workspace.openTextDocument(uri)
        const data = textDocument.getText()

        let manifest = null
        switch (textDocument.languageId) {
            case 'json':
                manifest = JSON.parse(data) as FlatpakManifestSchema
                break
            case 'yaml':
                manifest = yaml.safeLoad(data) as FlatpakManifestSchema
                break
            default:
                // This should not be triggered since only json,yaml,yml are passed in findFiles
                console.error(`Trying to parse a document with invalid language id: ${textDocument.languageId}`)
                break
        }

        if (manifest === null) {
            return null
        }

        if (this.isValidManifest(manifest)) {
            return new FlatpakManifest(
                uri,
                manifest,
                await this.isSandboxed()
            )
        }

        return null
    }

    /**
     * Checks whether VSCode is installed in a sandbox
     */
    private async isSandboxed(): Promise<boolean> {
        return await exists('/.flatpak-info')
    }

    private isValidManifest(manifest: FlatpakManifestSchema): boolean {
        const hasId = (manifest.id || manifest['app-id']) !== undefined
        const hasModules = manifest.modules !== undefined
        return hasId && hasModules
    }
}
