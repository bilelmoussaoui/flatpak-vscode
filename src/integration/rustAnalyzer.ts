import { Manifest } from '../manifest'
import { SdkIntegration } from './base'

export class RustAnalyzer extends SdkIntegration {
    constructor() {
        super('rust-lang.rust-analyzer', ['rust-stable', 'rust-nightly'])
    }

    async load(manifest: Manifest): Promise<void> {
        let sdkFolder
        if (manifest.sdkExtensions().includes('rust-nightly')) {
            sdkFolder = 'rust-nightly'
        } else if (manifest.sdkExtensions().includes('rust-stable')) {
            sdkFolder = 'rust-stable'
        } else {
            throw new Error('unreachable code')
        }
        const binPath = `/usr/lib/sdk/${sdkFolder}/bin/`

        await manifest.overrideWorkspaceCommandConfig('rust-analyzer', 'server.path', 'rust-analyzer', binPath)

        const buildSystemBuildDir = manifest.buildSystemBuildDir()
        if (buildSystemBuildDir !== null) {
            const envArgs = new Map([['CARGO_HOME', `${buildSystemBuildDir}/cargo-home`]])
            await manifest.overrideWorkspaceCommandConfig('rust-analyzer', 'runnables.command', 'cargo', binPath, envArgs)
        }

        await manifest.overrideWorkspaceConfig('rust-analyzer', 'files.excludeDirs', ['.flatpak', '.flatpak-builder', '_build', 'build', 'builddir'])
    }

    async unload(manifest: Manifest): Promise<void> {
        await manifest.restoreWorkspaceConfig('rust-analyzer', 'server.path')
        await manifest.restoreWorkspaceConfig('rust-analyzer', 'runnables.command')
        await manifest.restoreWorkspaceConfig('rust-analyzer', 'files.excludeDirs')
    }
}
