import { Manifest } from '../manifest'
import { RustAnalyzer } from './rustAnalyzer'
import { Vala } from './vala'

const INTEGRATIONS = [
    new RustAnalyzer('matklad.rust-analyzer', 'rust'),
    new Vala('prince781.vala', 'vala')
]

export async function loadIntegrations(manifest: Manifest) {
    for (const integration of INTEGRATIONS) {
        if (integration.hasRequiredSdkExtension(manifest) && integration.isExtensionEnabled()) {
            await integration.load(manifest)
            console.log(`Loaded integration ${integration.constructor.name}`)
        }
    }
}

export async function unloadIntegrations(manifest: Manifest) {
    for (const integration of INTEGRATIONS) {
        if (integration.hasRequiredSdkExtension(manifest) && integration.isExtensionEnabled()) {
            await integration.unload(manifest)
            console.log(`Unloaded integration ${integration.constructor.name}`)
        }
    }
}
