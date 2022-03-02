import { Manifest } from '../manifest'

export async function loadVLSConfigOverrides(manifest: Manifest): Promise<void> {
    await manifest.overrideWorkspaceCommandConfig('vls', 'languageServerPath', 'vala-language-server', '/usr/lib/sdk/vala/bin/')
}

export async function restoreVLSConfigOverrides(manifest: Manifest): Promise<void> {
    await manifest.restoreWorkspaceConfig('vls', 'languageServerPath')
}
