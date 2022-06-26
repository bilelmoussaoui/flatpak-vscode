import { IS_SANDBOXED } from './extension'
import * as fs from 'fs/promises'
import * as pty from './nodePty'
import { PathLike } from 'fs'
import { execFileSync, execFile, ChildProcess } from 'child_process'
import { OutputTerminal } from './outputTerminal'
import { CancellationToken } from 'vscode'

let FLATPAK_BUILDER_HOST_EXISTS: boolean | undefined
let FLATPAK_BUILDER_SANDBOXED_EXISTS: boolean | undefined

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

/**
 * Tries to run the command in the host environment
 */
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

    static flatpakBuilder(args: string[], options?: CommandOptions): Command {
        if (flatpakBuilderHostExists()) {
            return new Command('flatpak-builder', args, options)
        } else if (flatpakBuilderSandboxedExists()) {
            return new Command('flatpak', ['run', 'org.flatpak.Builder', ...args], options)
        } else {
            // User may have installed either after receiving the error
            // so invalidate to check again if either now exists
            FLATPAK_BUILDER_HOST_EXISTS = undefined
            FLATPAK_BUILDER_SANDBOXED_EXISTS = undefined

            throw new Error('Flatpak builder was not found. Please install either `flatpak-builder` from your distro repositories or `org.flatpak.Builder` through `flatpak install`')
        }
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

    exec(): ChildProcess {
        return execFile(this.program, this.args, { cwd: this.cwd })
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

/**
 * Whether the flatpak-builder exists on host
 */
function flatpakBuilderHostExists(): boolean {
    if (FLATPAK_BUILDER_HOST_EXISTS === undefined) {
        const command = new Command('flatpak-builder', ['--version'])

        try {
            const version = command
                .execSync()
                .toString()
                .replace('flatpak-builder', '')
                .trim()
            FLATPAK_BUILDER_HOST_EXISTS = true
            console.log(`host flatpak-builder version: ${version}`)
        } catch (error) {
            FLATPAK_BUILDER_HOST_EXISTS = false
            console.log(`host flatpak-builder not found: ${error as string}`)
        }
    }

    return FLATPAK_BUILDER_HOST_EXISTS
}

/**
 * Whether the flatpak-installed org.flatpak.Builder exists
 */
function flatpakBuilderSandboxedExists(): boolean {
    if (FLATPAK_BUILDER_SANDBOXED_EXISTS === undefined) {
        const command = new Command('flatpak', ['run', 'org.flatpak.Builder', '--version'])

        try {
            const version = command
                .execSync()
                .toString()
                .replace('flatpak-builder', '')
                .trim()
            FLATPAK_BUILDER_SANDBOXED_EXISTS = true
            console.log(`flatpak-installed flatpak-builder version: ${version}`)
        } catch (error) {
            FLATPAK_BUILDER_SANDBOXED_EXISTS = false
            console.log(`flatpak-installed flatpak-builder not found: ${error as string}`)
        }
    }

    return FLATPAK_BUILDER_SANDBOXED_EXISTS
}
