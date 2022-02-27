import { FlatpakManifest } from './flatpakManifest'
import * as vscode from 'vscode'

export class FlatpakManifestMap {
    private readonly inner: Map<string, FlatpakManifest>

    constructor() {
        this.inner = new Map()
    }

    add(manifest: FlatpakManifest): void {
        this.inner.set(manifest.uri.fsPath, manifest)
    }

    delete(uri: vscode.Uri): boolean {
        return this.inner.delete(uri.fsPath)
    }

    get(uri: vscode.Uri): FlatpakManifest | undefined {
        return this.inner.get(uri.fsPath)
    }

    getFirstItem(): FlatpakManifest | undefined {
        return Array.from(this.inner.values())[0]
    }

    size(): number {
        return this.inner.size
    }

    isEmpty(): boolean {
        return this.size() === 0
    }

    forEach(callbackFn: (manifest: FlatpakManifest) => void): void {
        this.inner.forEach((value) => callbackFn(value))
    }
}
