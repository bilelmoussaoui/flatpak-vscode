import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as readline from 'readline'
import { failure, finished, newTask } from './store'
import { TaskMode } from './taskMode'
import { Command } from './command'

export class FlatpakTerminal {
  private commands: Command[] = []
  private currentCommand: number
  public failed: boolean
  private isRunning = false
  private mode?: TaskMode
  private output: vscode.OutputChannel
  private currentProcess?: child_process.ChildProcessWithoutNullStreams
  public completeBuild = false

  constructor(outputChannel: vscode.OutputChannel) {
    this.currentCommand = 0
    this.output = outputChannel
    this.failed = false
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  close(): void {
    if (this.currentProcess) {
      this.currentProcess.emit('close', -1)
    }
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

  onError(message: string, command: Command): void {
    this.writeError(message)
    failure({ command, message })
    this.failed = true
    this.isRunning = false
  }

  spawnNext(): void {
    this.currentCommand++
    if (this.failed) {
      return
    }
    if (this.currentCommand <= this.commands.length - 1) {
      this.spawn(this.commands[this.currentCommand]).finally(
        () => { }, // eslint-disable-line @typescript-eslint/no-empty-function
      )
    } else {
      this.currentCommand = 0
      this.isRunning = false
      finished({ mode: this.mode as TaskMode, restore: false, completeBuild: this.completeBuild })
      this.completeBuild = false
    }
  }

  async spawn(command: Command): Promise<void> {
    if (this.mode !== undefined) {
      newTask(this.mode)
    }

    this.write(`> ${command.toString()} <`)
    this.currentProcess = await command.run()
    this.isRunning = true
    readline
      .createInterface({
        input: this.currentProcess.stdout,
        terminal: false,
      })
      .on('line', (line) => this.write(line))

    readline
      .createInterface({
        input: this.currentProcess.stderr,
        terminal: false,
      })
      .on('line', (line) => this.write(line))

    this.currentProcess
      .on('error', (error) => {
        this.onError(error.message, this.current())
      })
      .on('close', (code) => {
        console.log(code)
        if (code !== 0) {
          this.onError(`Child process closed all stdio with code ${code}`, this.current())
          return
        }
        this.spawnNext()
      })
  }

  current(): Command {
    return this.commands[this.currentCommand]
  }

  private writeError(message: string): void {
    this.write(message)
  }

  private write(message: string): void {
    this.output.appendLine(message)
  }
}
