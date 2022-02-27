import { Manifest } from './manifest'
import * as vscode from 'vscode'

export class ManifestMap {
    private readonly inner: Map<string, Manifest>

    constructor() {
        this.inner = new Map()
    }

    add(manifest: Manifest): void {
        this.inner.set(manifest.uri.fsPath, manifest)
    }

    delete(uri: vscode.Uri): boolean {
        return this.inner.delete(uri.fsPath)
    }

    get(uri: vscode.Uri): Manifest | undefined {
        return this.inner.get(uri.fsPath)
    }

    getFirstItem(): Manifest | undefined {
        return Array.from(this.inner.values())[0]
    }

    size(): number {
        return this.inner.size
    }

    isEmpty(): boolean {
        return this.size() === 0
    }

    forEach(callbackFn: (manifest: Manifest) => void): void {
        this.inner.forEach((value) => callbackFn(value))
    }
}
