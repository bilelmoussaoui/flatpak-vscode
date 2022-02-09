import { FlatpakManifest } from "../terminal"

export const loadRustAnalyzerConfigOverrides = async (manifest: FlatpakManifest): Promise<void> => {
    await manifest.overrideWorkspaceCommandConfig('rust-analyzer', 'server.path', 'rust-analyzer')

    const buildSystemBuildDir = manifest.buildSystemBuildDir()

    const envArgs = new Map()
    if (buildSystemBuildDir !== null) {
        envArgs.set("CARGO_HOME", `${buildSystemBuildDir}/cargo-home`)
    }
    await manifest.overrideWorkspaceCommandConfig('rust-analyzer', 'runnables.overrideCargo', 'cargo', envArgs)

    const cargoExtraArgs = []
    if (buildSystemBuildDir !== null) {
        cargoExtraArgs.push(`--target-dir=${buildSystemBuildDir}/src`)
    }
    await manifest.overrideWorkspaceConfig('rust-analyzer', 'runnables.cargoExtraArgs', cargoExtraArgs)

    await manifest.overrideWorkspaceConfig('rust-analyzer', 'files.excludeDirs', ['.flatpak'])
}

export const restoreRustAnalyzerConfigOverrides = async (manifest: FlatpakManifest): Promise<void> => {
    await manifest.restoreWorkspaceConfig('rust-analyzer', 'server.path')
    await manifest.restoreWorkspaceConfig('rust-analyzer', 'runnables.overrideCargo')
    await manifest.restoreWorkspaceConfig('rust-analyzer', 'runnables.cargoExtraArgs')
    await manifest.restoreWorkspaceConfig('rust-analyzer', 'files.excludeDirs')
}
