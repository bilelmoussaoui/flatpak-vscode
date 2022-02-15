import * as vscode from 'vscode'

const RESET_COLOR = '\x1b[0m'

export class FlatpakTerminal {
    private inner?: vscode.Terminal
    private isOpen: boolean
    private readonly pty: vscode.Pseudoterminal
    private readonly writeEmitter: vscode.EventEmitter<string>

    private readonly _onDidOpen = new vscode.EventEmitter<void>()
    private readonly onDidOpen = this._onDidOpen.event

    private readonly _onDidClose = new vscode.EventEmitter<void>()
    readonly onDidClose = this._onDidClose.event

    constructor() {
        this.isOpen = false
        this.writeEmitter = new vscode.EventEmitter<string>();
        this.pty = {
            open: () => {
                this.isOpen = true
                this._onDidOpen.fire()
            },
            close: () => {
                this.isOpen = false
                this._onDidClose.fire()
                this.inner?.dispose()
                this.inner = undefined
            },
            onDidWrite: this.writeEmitter.event,
        }
    }

    append(content: string): void {
        this.writeEmitter.fire(content)
    }

    appendError(message: string): void {
        const boldRed = '\x1b[1;31m'
        this.append(`\r${boldRed}>>> ${message}${RESET_COLOR}\r\n`)
    }

    appendMessage(message: string): void {
        const boldWhite = '\x1b[1;37m'
        this.append(`\r${boldWhite}>>> ${message}${RESET_COLOR}\r\n`)
    }

    async show(preserveFocus?: boolean): Promise<void> {
        if (this.inner === undefined) {
            this.inner = vscode.window.createTerminal({
                name: 'Flatpak',
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

    private async waitToOpen(): Promise<void> {
        if (this.isOpen) {
            return
        }

        return new Promise((resolve) => {
            this.onDidOpen(() => resolve())
        })
    }
}
