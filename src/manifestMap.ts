import { Manifest } from './manifest'
import * as vscode from 'vscode'

export class ManifestMap implements Iterable<Manifest> {
    private readonly inner: Map<string, Manifest>

    private readonly _onDidItemsChanged = new vscode.EventEmitter<void>()
    readonly onDidItemsChanged = this._onDidItemsChanged.event
    private readonly _onDidItemAdded = new vscode.EventEmitter<Manifest>()
    readonly onDidItemAdded = this._onDidItemAdded.event
    private readonly _onDidItemDeleted = new vscode.EventEmitter<vscode.Uri>()
    readonly onDidItemDeleted = this._onDidItemDeleted.event

    constructor() {
        this.inner = new Map()
    }

    [Symbol.iterator](): IterableIterator<Manifest> {
        return this.inner.values()
    }

    add(manifest: Manifest): void {
        const isAdded = !this.inner.has(manifest.uri.fsPath)

        this.inner.set(manifest.uri.fsPath, manifest)
        this._onDidItemsChanged.fire()

        if (isAdded) {
            this._onDidItemAdded.fire(manifest)
        }
    }

    delete(uri: vscode.Uri): boolean {
        const isDeleted = this.inner.delete(uri.fsPath)

        if (isDeleted) {
            this._onDidItemsChanged.fire()
            this._onDidItemDeleted.fire(uri)
        }

        return isDeleted
    }

    update(other: ManifestMap): void {
        for (const manifest of this) {
            if (!other.inner.has(manifest.uri.fsPath)) {
                this.delete(manifest.uri)
            }
        }

        for (const manifest of other) {
            this.add(manifest)
        }
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
