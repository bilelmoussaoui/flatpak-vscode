import { Manifest } from '../manifest'
import { MesonBuild } from './mesonBuild'
import { RustAnalyzer } from './rustAnalyzer'
import { Vala } from './vala'
import { window } from 'vscode'

const INTEGRATIONS = [
    new MesonBuild(),
    new RustAnalyzer(),
    new Vala(),
]

export async function loadIntegrations(manifest: Manifest) {
    for (const integration of INTEGRATIONS) {
        console.log(`Trying to load integration ${integration.extensionId}`)
        if (integration.isApplicable(manifest) && integration.isExtensionEnabled() && integration.isEnabled()) {
            try {
                await integration.load(manifest)
                console.log(`Loaded integration ${integration.constructor.name}`)
            } catch (err) {
                void window.showErrorMessage(`Failed to load ${integration.constructor.name} integration: ${err as string}`)
            }
        } else {
            console.log(`Integration ${integration.extensionId} is not applicable`)
        }
    }
}

export async function unloadIntegrations(manifest: Manifest) {
    for (const integration of INTEGRATIONS) {
        console.log(`Trying to unload integration ${integration.extensionId}`)
        if (integration.isApplicable(manifest) && integration.isExtensionEnabled()) {
            try {
                await integration.unload(manifest)
                console.log(`Unloaded integration ${integration.constructor.name}`)
            } catch (err) {
                void window.showWarningMessage(`Failed to unload ${integration.constructor.name} integration: ${err as string}`)
            }
        } else {
            console.log(`Integration ${integration.extensionId} is not applicable`)
        }
    }
}
