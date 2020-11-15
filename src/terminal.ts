import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as readline from 'readline'

export class Command {
  name: string
  cwd?: string
  arguments: readonly string[]
  isSandboxed: boolean

  constructor(
    name: string,
    args: string[],
    cwd?: string,
    isSandboxed?: boolean
  ) {
    this.name = name
    this.cwd = cwd
    this.arguments = args
    this.isSandboxed = isSandboxed || false
  }

  toString(): string {
    const cmd = `${this.name} ${this.arguments.join(' ')}`
    if (this.isSandboxed) {
      return `flatpak-spawn --host ${cmd}`
    }
    return cmd
  }
}

export class FlatpakTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>()
  onDidWrite: vscode.Event<string> = this.writeEmitter.event
  private closeEmitter = new vscode.EventEmitter<void>()
  onDidClose?: vscode.Event<void> = this.closeEmitter.event
  onDidOverrideDimensions?:
    | vscode.Event<vscode.TerminalDimensions | undefined>
    | undefined

  private commands: Command[]
  private currentCommand: number
  public failed: boolean

  constructor(commands: Command[]) {
    this.commands = commands
    this.currentCommand = 0
    this.failed = false
  }
  close(): void {
    //
  }

  open(): void {
    this.spawn(this.commands[0])
  }

  spawnNext(): void {
    if (this.failed) {
      this.closeEmitter.fire()
      return
    }
    if (this.currentCommand < this.commands.length) {
      this.spawn(this.commands[this.currentCommand])
    } else {
      this.currentCommand = 0
      this.closeEmitter.fire()
    }
  }

  spawn(command: Command): void {
    this.writeEmitter.fire(`${command.toString()}`)
    const proc = child_process.spawn(command.name, command.arguments, {
      cwd: command.cwd,
      shell: '/usr/bin/bash',
    })
    readline
      .createInterface({
        input: proc.stdout,
        terminal: true,
      })
      .on('line', (line) => {
        this.writeEmitter.fire(line)
        this.writeEmitter.fire('\r\n')
      })
    readline
      .createInterface({
        input: proc.stderr,
        terminal: true,
      })
      .on('line', (line) => {
        this.writeEmitter.fire(line)
        this.writeEmitter.fire('\r\n')
      })
      .on('close', () => {
        this.failed = true
      })

    proc.on('error', (error) => {
      this.writeEmitter.fire(error.message)
      this.failed = true
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        this.failed = true
      }
      this.currentCommand++
      this.spawnNext()
    })
  }
}
