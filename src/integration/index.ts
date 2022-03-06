import { Manifest } from '../manifest'
import { MesonBuild } from './mesonBuild'
import { RustAnalyzer } from './rustAnalyzer'
import { Vala } from './vala'

const INTEGRATIONS = [
    new MesonBuild(),
    new RustAnalyzer(),
    new Vala(),
]

export async function loadIntegrations(manifest: Manifest) {
    for (const integration of INTEGRATIONS) {
        if (integration.isApplicable(manifest) && integration.isExtensionEnabled()) {
            await integration.load(manifest)
            console.log(`Loaded integration ${integration.constructor.name}`)
        }
    }
}

export async function unloadIntegrations(manifest: Manifest) {
    for (const integration of INTEGRATIONS) {
        if (integration.isApplicable(manifest) && integration.isExtensionEnabled()) {
            await integration.unload(manifest)
            console.log(`Unloaded integration ${integration.constructor.name}`)
        }
    }
}
