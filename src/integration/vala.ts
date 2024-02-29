import { Manifest } from '../manifest'
import { SdkIntegration } from './base'

export class Vala extends SdkIntegration {
    constructor() {
        super('prince781.vala', ['vala'])
    }

    async load(manifest: Manifest): Promise<void> {
        await manifest.overrideWorkspaceCommandConfig('vala', 'languageServerPath', 'vala-language-server', '/usr/lib/sdk/vala/bin/')
    }

    async unload(manifest: Manifest): Promise<void> {
        await manifest.restoreWorkspaceConfig('vala', 'languageServerPath')
    }
}
