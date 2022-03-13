import * as vscode from 'vscode'
import { TaskMode, taskModeAsStatus } from './taskMode'
import { Command } from './command'
import * as pty from './nodePty'
import { OutputTerminal } from './outputTerminal'
import { RunnerStatusItem } from './runnerStatusItem'
import { EXTENSION_ID } from './extension'

export interface FinishedTask {
    mode: TaskMode
    restore: boolean
    completeBuild: boolean
}

export class Runner implements vscode.Disposable {
    private commands: Command[] = []
    private currentCommand: number
    private failed: boolean
    private isRunning = false
    private mode?: TaskMode
    private currentProcess?: pty.IPty
    public completeBuild = false
    private readonly terminal: OutputTerminal
    private readonly statusItem: RunnerStatusItem

    private readonly _onDidFinishedTask = new vscode.EventEmitter<FinishedTask>()
    readonly onDidFinishedTask = this._onDidFinishedTask.event

    constructor(terminal: OutputTerminal) {
        this.statusItem = new RunnerStatusItem()
        this.currentCommand = 0
        this.failed = false
        this.terminal = terminal
        this.terminal.onDidClose(() => this.close())
    }

    close(): void {
        this.terminal.appendMessage('Child process exited')

        this.commands = []
        this.currentCommand = 0

        this.currentProcess?.kill()
        this.currentProcess = undefined

        this.failed = false
        this.isRunning = false
    }

    async setCommands(commands: Command[], mode: TaskMode): Promise<void> {
        if (this.isRunning) {
            this.commands = [...this.commands, ...commands]
        } else {
            this.commands = commands
            this.mode = mode
            this.currentCommand = 0
            this.failed = false
            await this.spawn(this.commands[0])
        }
    }

    onError(message: string): void {
        this.terminal.appendError(message)
        this.failed = true
        this.isRunning = false

        let title = 'An error occurred'
        if (this.mode !== undefined) {
            title = `Failed to execute ${this.mode}`
        }
        this.statusItem?.setStatus({
            type: 'error',
            isOperation: false,
            title,
            clickable: {
                command: `${EXTENSION_ID}.show-output-terminal`,
                tooltip: 'Show output'
            },
        })
    }

    async spawnNext(): Promise<void> {
        this.currentCommand++
        if (this.failed) {
            return
        }
        if (this.currentCommand <= this.commands.length - 1) {
            await this.spawn(this.commands[this.currentCommand])
        } else {
            this.currentCommand = 0
            this.isRunning = false
            this._onDidFinishedTask.fire({ mode: this.mode as TaskMode, restore: false, completeBuild: this.completeBuild })
            await this.setActiveContext(false)
            this.statusItem?.setStatus(null)
            this.completeBuild = false
        }
    }

    async spawn(command: Command): Promise<void> {
        if (this.mode !== undefined) {
            await this.setActiveContext(true)
            this.statusItem.setStatus(taskModeAsStatus(this.mode))
        }

        this.terminal.appendMessage(command.toString())
        this.currentProcess = command.spawn()
        this.isRunning = true

        this.currentProcess.onData((data) => {
            this.terminal.append(data)
        })

        this.currentProcess
            .onExit(async ({ exitCode }) => {
                if (exitCode !== 0) {
                    this.onError(`Child process exited with code ${exitCode}`)
                    await this.setActiveContext(false)
                    return
                }
                await this.spawnNext()
            })
    }

    current(): Command {
        return this.commands[this.currentCommand]
    }

    dispose(): void {
        this.statusItem.dispose()
    }

    private async setActiveContext(value: boolean): Promise<void> {
        await vscode.commands.executeCommand('setContext', 'flatpakRunnerActive', value)
    }
}
