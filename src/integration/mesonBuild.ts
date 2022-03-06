import { Manifest } from '../manifest'
import { Integration } from './base'

export class MesonBuild extends Integration {
    constructor() {
        super('mesonbuild.mesonbuild')
    }

    isApplicable(manifest: Manifest): boolean {
        return manifest.module().buildsystem === 'meson'
    }

    async load(manifest: Manifest): Promise<void> {
        await manifest.overrideWorkspaceConfig('mesonbuild', 'configureOnOpen', false)

        const buildSystemBuildDir = manifest.buildSystemBuildDir()
        if (buildSystemBuildDir !== null) {
            await manifest.overrideWorkspaceConfig('mesonbuild', 'buildFolder', buildSystemBuildDir)
        }

        await manifest.overrideWorkspaceCommandConfig('mesonbuild', 'mesonPath', 'meson', '/usr/bin/')
    }

    async unload(manifest: Manifest): Promise<void> {
        await manifest.restoreWorkspaceConfig('mesonbuild', 'configureOnOpen')
        await manifest.restoreWorkspaceConfig('mesonbuild', 'buildFolder')
        await manifest.restoreWorkspaceConfig('mesonbuild', 'mesonPath')
    }
}
