import * as vscode from 'vscode'
import { SdkExtension } from '../flatpak.types'
import { Manifest } from '../manifest'

/**
 * Derive from this when needed more control for `isApplicable`.
 */
export abstract class Integration {
    readonly extensionId: string

    constructor(extensionId: string) {
        this.extensionId = extensionId
    }

    /**
     * Whether the extension this is integrating is enabled.
     */
    isExtensionEnabled(): boolean {
        return vscode.extensions.getExtension(this.extensionId) !== undefined
    }

    /**
     * Whether the integration is applicable to current context. It will only
     * be loaded on scenario where this returns true.
     * @param manifest contains necessary context
     */
    abstract isApplicable(manifest: Manifest): boolean

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

/**
 * Derive from this when creating an integration that requires a specific SDK extension.
 */
export abstract class SdkIntegration extends Integration {
    private readonly requiredSdkExtension: SdkExtension

    constructor(extensionId: string, requiredSdkExtension: SdkExtension) {
        super(extensionId)
        this.requiredSdkExtension = requiredSdkExtension
    }

    isApplicable(manifest: Manifest): boolean {
        return manifest.sdkExtensions().includes(this.requiredSdkExtension)
    }
}
