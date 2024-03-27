import * as vscode from 'vscode'

const RESET_COLOR = '\x1b[0m'

export class OutputTerminal implements vscode.Disposable {
    private inner?: vscode.Terminal
    private isOpen: boolean
    private _dimensions?: vscode.TerminalDimensions
    private readonly pty: vscode.Pseudoterminal
    private readonly writeEmitter: vscode.EventEmitter<string>

    private readonly _onDidOpen = new vscode.EventEmitter<void>()
    private readonly onDidOpen = this._onDidOpen.event

    private readonly _onDidClose = new vscode.EventEmitter<void>()
    readonly onDidClose = this._onDidClose.event

    private readonly _onDidSetDimensions = new vscode.EventEmitter<vscode.TerminalDimensions>()
    readonly onDidSetDimensions = this._onDidSetDimensions.event

    constructor() {
        this.isOpen = false
        this.writeEmitter = new vscode.EventEmitter<string>()
        this.pty = {
            open: (dimensions) => {
                this._dimensions = dimensions
                this.isOpen = true
                this._onDidOpen.fire()
            },
            setDimensions: (dimensions) => {
                this._dimensions = dimensions
                this._onDidSetDimensions.fire(dimensions)
            },
            close: () => {
                this.isOpen = false
                this._onDidClose.fire()
                this.inner?.dispose()
                this.inner = undefined
                this._dimensions = undefined
            },
            onDidWrite: this.writeEmitter.event,
        }
    }

    get dimensions(): vscode.TerminalDimensions | undefined {
        return this._dimensions
    }

    append(content: string): void {
        this.writeEmitter.fire(content)
    }

    appendLine(content: string): void {
        this.append(`${content}\r\n`)
    }

    appendError(message: string): void {
        const boldRed = '\x1b[1;31m'
        this.appendLine(`\r${boldRed}>>> ${message}${RESET_COLOR}`)
    }

    appendMessage(message: string): void {
        const boldWhite = '\x1b[1;37m'
        this.appendLine(`\r${boldWhite}>>> ${message}${RESET_COLOR}`)
    }

    async show(preserveFocus?: boolean): Promise<void> {
        if (this.inner === undefined) {
            this.inner = vscode.window.createTerminal({
                name: 'Flatpak Output Terminal',
                iconPath: new vscode.ThemeIcon('package'),
                pty: this.pty
            })
        }
        this.inner.show(preserveFocus)

        await this.waitToOpen()
    }

    hide(): void {
        this.inner?.hide()
    }

    dispose() {
        this.inner?.dispose()
        this.pty.close()
    }

    private async waitToOpen(): Promise<void> {
        if (this.isOpen) {
            return
        }

        return new Promise((resolve) => {
            this.onDidOpen(() => resolve())
        })
    }
}
