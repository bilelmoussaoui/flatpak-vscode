import * as vscode from 'vscode'

export interface Clickable {
    command: string,
    tooltip: string,
}

export interface Status {
    type: 'ok' | 'error'
    title: string
    quiescent: boolean,
    clickable: Clickable | null
}

export class StatusBarItem {
    private inner: vscode.StatusBarItem

    constructor(extCtx: vscode.ExtensionContext) {
        this.inner = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
        extCtx.subscriptions.push(this.inner)
    }

    setStatus(status: Status | null): void {
        if (status === null) {
            this.inner.hide()
            return
        }

        let icon = ''

        switch (status.type) {
            case 'ok':
                this.inner.color = undefined
                break
            case 'error':
                this.inner.color = new vscode.ThemeColor('notificationsErrorIcon.foreground')
                icon = '$(error) '
                break
        }

        this.inner.command = status.clickable?.command
        this.inner.tooltip = status.clickable?.tooltip

        if (status.quiescent) {
            icon = '$(sync~spin) '
        }

        this.inner.text = `${icon} ${status.title}`
        this.inner.show()
    }
}
