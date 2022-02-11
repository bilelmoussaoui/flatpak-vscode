import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as readline from 'readline'
import { failure, finished, newTask } from './store'
import { TaskMode } from './taskMode'
import { Command } from './command'

export class FlatpakRunner {
  private commands: Command[] = []
  private currentCommand: number
  public failed: boolean
  private isRunning = false
  private mode?: TaskMode
  private currentProcess?: child_process.ChildProcessWithoutNullStreams
  public completeBuild = false

  private readonly _onDidOutput = new vscode.EventEmitter<string>()
  readonly onDidOutput = this._onDidOutput.event

  constructor() {
    this.currentCommand = 0
    this.failed = false
  }

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
    this._onDidOutput.fire(`ERROR: ${message}`)
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

    this._onDidOutput.fire(`> ${command.toString()} <`)
    this.currentProcess = await command.run()
    this.isRunning = true
    readline
      .createInterface({
        input: this.currentProcess.stdout,
        terminal: true,
      })
      .on('line', (line) => this._onDidOutput.fire(line))

    readline
      .createInterface({
        input: this.currentProcess.stderr,
        terminal: true,
      })
      .on('line', (line) => this._onDidOutput.fire(line))

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
}
