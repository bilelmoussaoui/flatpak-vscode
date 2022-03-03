import { Manifest } from '../manifest'
import { Integration } from './base'

export class Vala extends Integration {
    async load(manifest: Manifest): Promise<void> {
        await manifest.overrideWorkspaceCommandConfig('vls', 'languageServerPath', 'vala-language-server', '/usr/lib/sdk/vala/bin/')
    }

    async unload(manifest: Manifest): Promise<void> {
        await manifest.restoreWorkspaceConfig('vls', 'languageServerPath')
    }
}
