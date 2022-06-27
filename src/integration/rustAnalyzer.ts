import { Manifest } from '../manifest'
import { SdkIntegration } from './base'

export class RustAnalyzer extends SdkIntegration {
    constructor() {
        super('rust-lang.rust-analyzer', 'rust')
    }

    async load(manifest: Manifest): Promise<void> {
        await manifest.overrideWorkspaceCommandConfig('rust-analyzer', 'server.path', 'rust-analyzer', '/usr/lib/sdk/rust-stable/bin/')

        const buildSystemBuildDir = manifest.buildSystemBuildDir()
        if (buildSystemBuildDir !== null) {
            const envArgs = new Map([['CARGO_HOME', `${buildSystemBuildDir}/cargo-home`]])
            await manifest.overrideWorkspaceCommandConfig('rust-analyzer', 'runnables.command', 'cargo', '/usr/lib/sdk/rust-stable/bin/', envArgs)
        }

        await manifest.overrideWorkspaceConfig('rust-analyzer', 'files.excludeDirs', ['.flatpak'])
    }

    async unload(manifest: Manifest): Promise<void> {
        await manifest.restoreWorkspaceConfig('rust-analyzer', 'server.path')
        await manifest.restoreWorkspaceConfig('rust-analyzer', 'runnables.command')
        await manifest.restoreWorkspaceConfig('rust-analyzer', 'files.excludeDirs')
    }
}
