import * as vscode from 'vscode'
import { TaskMode, taskModeAsStatus } from './taskMode'
import { Canceled, Command } from './command'
import { OutputTerminal } from './outputTerminal'
import { RunnerStatusItem } from './runnerStatusItem'
import { EXTENSION_ID } from './extension'

export class RunnerError extends Error {
    constructor(mode: TaskMode, message: string) {
        super(`Failed to execute ${mode}: ${message}`)
    }
}

export class Runner implements vscode.Disposable {
    private readonly outputTerminal: OutputTerminal
    private readonly statusItem: RunnerStatusItem
    private isActive: boolean
    private currentCommandHandler?: vscode.CancellationTokenSource

    constructor(outputTerminal: OutputTerminal) {
        this.outputTerminal = outputTerminal
        this.outputTerminal.onDidClose(() => this.stop())

        this.statusItem = new RunnerStatusItem()
        this.isActive = false
    }

    /**
     * Throws an error if this is active
     */
    ensureIdle() {
        if (this.isActive) {
            throw new Error('Stop the currently running task first.')
        }
    }

    /**
     * Run the commands one after another in order. Errors on a command would
     * inhibit other queued commands from running.
     * @param commands The commands to be executed
     * @param mode Execution context
     */
    async execute(commands: Command[], mode: TaskMode): Promise<void> {
        await this.outputTerminal.show(true)

        await this.setActive(true)
        this.statusItem.setStatus(taskModeAsStatus(mode))

        try {
            for (const command of commands) {
                this.outputTerminal.appendMessage(command.toString())

                this.currentCommandHandler = new vscode.CancellationTokenSource()
                await command.spawn(this.outputTerminal, this.currentCommandHandler.token)
            }
        } catch (err) {
            // Don't error when stopped the application using stop button
            if (mode === TaskMode.run && err instanceof Canceled) {
                return
            }

            this.onError(mode, err as string)
            throw new RunnerError(mode, err as string)
        } finally {
            this.currentCommandHandler = undefined
            this.statusItem.setStatus(null)
            await this.setActive(false)
        }
    }

    /**
     * Cancel the running and queued commands
     */
    async stop(): Promise<void> {
        await this.outputTerminal.show(true)

        if (this.currentCommandHandler !== undefined) {
            this.currentCommandHandler.cancel()
            this.currentCommandHandler = undefined
        }
    }

    async dispose() {
        await this.stop()
        this.statusItem.dispose()
    }

    private async setActive(value: boolean): Promise<void> {
        await vscode.commands.executeCommand('setContext', 'flatpakRunnerActive', value)
        this.isActive = value
    }

    private onError(mode: TaskMode, message: string): void {
        this.outputTerminal.appendError(message)

        this.statusItem.setStatus({
            type: 'error',
            isOperation: false,
            title: `Failed to execute ${mode}`,
            clickable: {
                command: `${EXTENSION_ID}.show-output-terminal`,
                tooltip: 'Show output'
            },
        })
    }
}
