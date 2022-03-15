import * as vscode from 'vscode'
import { TaskMode, taskModeAsStatus } from './taskMode'
import { Canceled, Command } from './command'
import { OutputTerminal } from './outputTerminal'
import { RunnerStatusItem } from './runnerStatusItem'
import { EXTENSION_ID } from './extension'

export class Runner implements vscode.Disposable {
    private readonly outputTerminal: OutputTerminal
    private readonly statusItem: RunnerStatusItem
    private currentCommandHandler?: vscode.CancellationTokenSource

    constructor(outputTerminal: OutputTerminal) {
        this.outputTerminal = outputTerminal
        this.outputTerminal.onDidClose(() => this.close())

        this.statusItem = new RunnerStatusItem()
    }

    /**
     * Run the commands one after another in order. Errors on a command would
     * inhibit other queued commands from running.
     * @param commands The commands to be executed
     * @param mode Execution context
     */
    async execute(commands: Command[], mode: TaskMode): Promise<void> {
        await this.outputTerminal.show(true)

        await this.setActiveContext(true)
        this.statusItem.setStatus(taskModeAsStatus(mode))

        try {
            for (const command of commands) {
                this.outputTerminal.appendMessage(command.toString())

                this.currentCommandHandler = new vscode.CancellationTokenSource()
                await command.spawn(this.outputTerminal, this.currentCommandHandler.token)
                this.currentCommandHandler = undefined
            }
        } catch (err) {
            // Don't error when stopped the application using stop button
            if (mode === TaskMode.run && err instanceof Canceled) {
                return
            }

            this.onError(mode, err as string)
            throw err
        } finally {
            this.statusItem.setStatus(null)
            await this.setActiveContext(false)
        }
    }

    /**
     * Cancel the running and queued commands
     */
    async close(): Promise<void> {
        await this.outputTerminal.show(true)

        if (this.currentCommandHandler !== undefined) {
            this.currentCommandHandler.cancel()
            this.currentCommandHandler = undefined
        }
    }

    async dispose() {
        await this.close()
        this.statusItem.dispose()
    }

    private onError(mode: TaskMode, message: string): void {
        this.outputTerminal.appendError(message)

        this.statusItem?.setStatus({
            type: 'error',
            isOperation: false,
            title: `Failed to execute ${mode}`,
            clickable: {
                command: `${EXTENSION_ID}.show-output-terminal`,
                tooltip: 'Show output'
            },
        })
    }

    private async setActiveContext(value: boolean): Promise<void> {
        await vscode.commands.executeCommand('setContext', 'flatpakRunnerActive', value)
    }
}
