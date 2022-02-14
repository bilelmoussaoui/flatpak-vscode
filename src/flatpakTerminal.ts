import * as vscode from 'vscode'

const RESET_COLOR = '\x1b[0m'

export class FlatpakTerminal {
    private inner?: vscode.Terminal
    private pty: vscode.Pseudoterminal
    private emitter: vscode.EventEmitter<string>

    private readonly _onDidClose = new vscode.EventEmitter<void>()
    readonly onDidClose = this._onDidClose.event

    constructor() {
        this.emitter = new vscode.EventEmitter<string>();
        this.pty = {
            open: () => console.log('Flatpak terminal opened'),
            close: () => {
                this._onDidClose.fire()
                this.inner?.dispose()
                this.inner = undefined
            },
            onDidWrite: this.emitter.event,
        }
    }

    append(content: string): void {
        this.emitter.fire(content)
    }

    appendError(message: string): void {
        const boldRed = '\x1b[1;31m'
        this.append(`\r${boldRed}>>> ${message}${RESET_COLOR}\r\n`)
    }

    appendMessage(message: string): void {
        const boldWhite = '\x1b[1;37m'
        this.append(`\r${boldWhite}>>> ${message}${RESET_COLOR}\r\n`)
    }

    show(preserveFocus?: boolean): void {
        if (this.inner === undefined) {
            this.inner = vscode.window.createTerminal({
                name: 'Flatpak',
                iconPath: new vscode.ThemeIcon('package'),
                pty: this.pty
            })
        }
        this.inner.show(preserveFocus)
    }

    hide(): void {
        this.inner?.hide()
    }
}
