import { Disposable, TerminalProfile, window } from 'vscode';
import { EXTENSION_ID } from './extension';
import { Manifest } from './manifest';

export class TerminalProvider implements Disposable {
    private providers: Array<Disposable> = []

    constructor(manifest: Manifest) {
        this.providers.push(window.registerTerminalProfileProvider(`${EXTENSION_ID}.runtime-terminal-provider`, {
            provideTerminalProfile: () => {
                return new TerminalProfile(manifest.runtimeTerminal())
            }
        }))

        this.providers.push(window.registerTerminalProfileProvider(`${EXTENSION_ID}.build-terminal-provider`, {
            provideTerminalProfile: () => {
                return new TerminalProfile(manifest.buildTerminal())
            }
        }))
    }

    dispose(): void {
        for (const provider of this.providers) {
            provider.dispose()
        }
    }
}
