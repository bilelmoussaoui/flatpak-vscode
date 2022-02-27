import { Disposable, TerminalProfile, window } from 'vscode';
import { EXT_ID } from './extension';
import { FlatpakManifest } from './flatpakManifest';

export class TerminalProvider implements Disposable {
    private providers: Array<Disposable> = []

    constructor(manifest: FlatpakManifest) {
        this.providers.push(window.registerTerminalProfileProvider(`${EXT_ID}.runtime-terminal-provider`, {
            provideTerminalProfile: () => {
                return new TerminalProfile(manifest.runtimeTerminal())
            }
        }))

        this.providers.push(window.registerTerminalProfileProvider(`${EXT_ID}.build-terminal-provider`, {
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
