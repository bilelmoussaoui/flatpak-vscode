import * as vscode from 'vscode'
import { failure, finished, newTask } from './store'
import { TaskMode } from './taskMode'
import { Command } from './command'
import * as pty from './nodePty'
import { FlatpakTerminal } from './flatpakTerminal'

export class FlatpakRunner {
  private commands: Command[] = []
  private currentCommand: number
  public failed: boolean
  private isRunning = false
  private mode?: TaskMode
  private currentProcess?: pty.IPty
  private terminal: FlatpakTerminal
  public completeBuild = false

  private readonly _onDidOutput = new vscode.EventEmitter<string>()
  readonly onDidOutput = this._onDidOutput.event

  constructor(terminal: FlatpakTerminal) {
    terminal.onDidClose(() => this.close())

    this.currentCommand = 0
    this.failed = false
    this.terminal = terminal
  }

  close(): void {
    this.currentProcess?.kill()
  }

  setCommands(commands: Command[], mode: TaskMode): void {
    if (this.isRunning) {
      this.commands = [...this.commands, ...commands]
    } else {
      this.commands = commands
      this.mode = mode
      this.currentCommand = 0
      this.failed = false
      this.spawn(this.commands[0])
    }
  }

  onError(message: string, command: Command): void {
    this.terminal.appendMessage(message, true)
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
      this.spawn(this.commands[this.currentCommand])
    } else {
      this.currentCommand = 0
      this.isRunning = false
      finished({ mode: this.mode as TaskMode, restore: false, completeBuild: this.completeBuild })
      this.completeBuild = false
    }
  }

  spawn(command: Command): void {
    if (this.mode !== undefined) {
      newTask(this.mode)
    }

    this.terminal.appendMessage(command.toString(), false)
    this.currentProcess = command.run()
    this.isRunning = true

    this.currentProcess.onData((data) => {
      this.terminal.append(data)
    })

    this.currentProcess
      .onExit(({ exitCode }) => {
        console.log(exitCode)
        if (exitCode !== 0) {
          this.onError(`Child process exited with code ${exitCode}`, this.current())
          return
        }
        this.spawnNext()
      })
  }

  current(): Command {
    return this.commands[this.currentCommand]
  }
}
