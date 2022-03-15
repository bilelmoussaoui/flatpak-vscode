import { IS_SANDBOXED } from './extension'
import * as fs from 'fs/promises'
import * as pty from './nodePty'
import { PathLike } from 'fs'
import { execFileSync } from 'child_process'
import { OutputTerminal } from './outputTerminal'
import { CancellationToken } from 'vscode'

export class Canceled extends Error {
    constructor() {
        super('Cancelled task')
    }
}

export interface CommandOptions {
    cwd?: string
    /**
     * Should only be used when running tests or debugging.
     */
    forceSandbox?: boolean
}

export class Command {
    readonly program: string
    readonly args: string[]
    private readonly cwd?: string

    constructor(program: string, args: string[], options?: CommandOptions) {
        if (options?.forceSandbox || IS_SANDBOXED) {
            this.program = 'flatpak-spawn'
            args.unshift('--host', '--env=TERM=xterm-256color', program)
        } else {
            this.program = program
        }
        this.args = args
        this.cwd = options?.cwd
    }

    toString(): string {
        return [
            this.program,
            ...this.args.filter((arg) => arg !== '--env=TERM=xterm-256color')
        ].join(' ')
    }

    /**
     * Store the command as a bash script
     * @param path save location
     */
    async saveAsScript(path: PathLike): Promise<void> {
        const cmd = ['#!/bin/sh', '', `${this.toString()} "$@"`].join('\n')
        await fs.writeFile(path, cmd)
        await fs.chmod(path, 0o755)
    }

    execSync(): Buffer {
        return execFileSync(this.program, this.args, {
            cwd: this.cwd
        })
    }

    /**
     * Spawn this with using node-pty
     * @param terminal Where the output stream will be sent
     * @param token For cancellation. This will send SIGINT on the process when cancelled.
     */
    spawn(terminal: OutputTerminal, token: CancellationToken): Promise<void> {
        const iPty = pty.spawn(this.program, this.args, {
            cwd: this.cwd,
        })

        iPty.onData((data) => {
            terminal.append(data)
        })

        return new Promise((resolve, reject) => {
            token.onCancellationRequested(() => {
                iPty.kill('SIGINT')
            })

            iPty.onExit(({ exitCode, signal }) => {
                if (exitCode !== 0) {
                    reject(new Error(`Child process exited with code ${exitCode}`))
                    return
                }

                if (signal === 2) {  // SIGINT
                    reject(new Canceled())
                    return
                }

                resolve()
            })
        })
    }
}
