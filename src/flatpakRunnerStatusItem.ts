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

export class FlatpakRunnerStatusItem implements vscode.Disposable {
    private inner: vscode.StatusBarItem

    constructor() {
        this.inner = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
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

    dispose(): void {
        this.inner.dispose()
    }
}
