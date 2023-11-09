import { Manifest } from './manifest'
import * as vscode from 'vscode'

export class ManifestMap implements Iterable<Manifest> {
    private readonly inner: Map<string, Manifest>

    private readonly _onDidItemsChanged = new vscode.EventEmitter<void>()
    readonly onDidItemsChanged = this._onDidItemsChanged.event

    constructor() {
        this.inner = new Map()
    }

    [Symbol.iterator](): IterableIterator<Manifest> {
        return this.inner.values()
    }

    add(manifest: Manifest): void {
        this.inner.set(manifest.uri.fsPath, manifest)
        this._onDidItemsChanged.fire()
    }

    delete(uri: vscode.Uri): boolean {
        const isDeleted = this.inner.delete(uri.fsPath)

        if (isDeleted) {
            this._onDidItemsChanged.fire()
        }

        return isDeleted
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
