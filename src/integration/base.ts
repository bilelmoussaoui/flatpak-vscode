import * as vscode from 'vscode'
import { SdkExtension } from '../flatpak.types'
import { Manifest } from '../manifest'

export abstract class Integration {
    private readonly extensionId: string
    private readonly requiredSdkExtension: SdkExtension

    constructor(extensionId: string, requiredSdkExtension: SdkExtension) {
        this.extensionId = extensionId
        this.requiredSdkExtension = requiredSdkExtension
    }

    /**
     * Whether the manifest has the required SDK extension for this to be applicable.
     * @param manifest The manifest to check
     * @returns
     */
    hasRequiredSdkExtension(manifest: Manifest): boolean {
        return manifest.sdkExtensions().includes(this.requiredSdkExtension)
    }

    /**
     * Whether the extension this is integrating is enabled.
     */
    isExtensionEnabled(): boolean {
        return vscode.extensions.getExtension(this.extensionId) !== undefined
    }

    /**
     * Called when loading the integration.
     * @param manifest contains the necessary context
     */
    abstract load(manifest: Manifest): Promise<void>

    /**
     * Called when unloading the integration. This mostly includes the cleanups.
     * @param manifest contains the necessary context
     */
    abstract unload(manifest: Manifest): Promise<void>
}
