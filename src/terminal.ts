import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as readline from 'readline'
import { failed } from './store'

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

  run(): child_process.ChildProcessWithoutNullStreams {
    let proc
    if (this.isSandboxed) {
      proc = child_process.spawn("flatpak-spawn", ["--host", this.name, ...this.arguments], {
        cwd: this.cwd,
        shell: '/usr/bin/bash',
      })
    }
    else {
      proc = child_process.spawn(this.name, this.arguments, {
        cwd: this.cwd,
        shell: '/usr/bin/bash',
      })
    }
    return proc
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

  onError(message: string, command: Command): void {
    this.writeEmitter.fire(message)
    failed({ command, message })
    this.failed = true
  }

  spawnNext(): void {
    this.currentCommand++
    if (this.failed) {
      this.currentCommand = 0
      this.closeEmitter.fire()
      return
    }
    console.log(this.commands.length)
    console.log(this.current())
    if (this.currentCommand < this.commands.length) {
      this.spawn(this.commands[this.currentCommand])
    } else {
      this.currentCommand = 0
      this.closeEmitter.fire()
    }
  }

  spawn(command: Command): void {
    this.writeEmitter.fire(`${command.toString()}`)
    this.writeEmitter.fire('\r\n\r\n')
    const proc = command.run()

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
        this.spawnNext()
      })

    proc.on('error', (error) => {
      this.onError(error.message, this.current())
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        this.onError('', this.current())
        return
      }
      this.spawnNext()
    })
  }

  current(): Command {
    return this.commands[this.currentCommand]
  }
}
