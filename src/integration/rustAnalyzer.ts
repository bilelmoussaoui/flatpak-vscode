import { Manifest } from '../manifest'

export async function loadRustAnalyzerConfigOverrides(manifest: Manifest): Promise<void> {
    await manifest.overrideWorkspaceCommandConfig('rust-analyzer', 'server.path', 'rust-analyzer', '/usr/lib/sdk/rust-stable/bin/')

    const buildSystemBuildDir = manifest.buildSystemBuildDir()
    if (buildSystemBuildDir !== null) {
        const envArgs = new Map([['CARGO_HOME', `${buildSystemBuildDir}/cargo-home`]])
        await manifest.overrideWorkspaceCommandConfig('rust-analyzer', 'runnables.overrideCargo', 'cargo', '/usr/lib/sdk/rust-stable/bin/', envArgs)

        const cargoExtraArgs = [`--target-dir=${buildSystemBuildDir}/src`]
        await manifest.overrideWorkspaceConfig('rust-analyzer', 'runnables.cargoExtraArgs', cargoExtraArgs)
    }

    await manifest.overrideWorkspaceConfig('rust-analyzer', 'files.excludeDirs', ['.flatpak'])
}

export async function restoreRustAnalyzerConfigOverrides(manifest: Manifest): Promise<void> {
    await manifest.restoreWorkspaceConfig('rust-analyzer', 'server.path')
    await manifest.restoreWorkspaceConfig('rust-analyzer', 'runnables.overrideCargo')
    await manifest.restoreWorkspaceConfig('rust-analyzer', 'runnables.cargoExtraArgs')
    await manifest.restoreWorkspaceConfig('rust-analyzer', 'files.excludeDirs')
}
