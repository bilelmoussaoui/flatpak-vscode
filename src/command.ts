import * as fs from 'fs/promises'
import * as pty from './nodePty'
import { PathLike } from 'fs'
import { execFileSync, execFile, ChildProcess } from 'child_process'
import { OutputTerminal } from './outputTerminal'
import { CancellationToken } from 'vscode'
import { AsyncLazy, Lazy } from './lazy'
import { IS_SANDBOXED } from './extension'
import { exists } from './utils'

/**
 * Whether flatpak-builder is installed on the host
 */
const FLATPAK_BUILDER_HOST_EXISTS = new Lazy(() => {
    try {
        const version = new Command('flatpak-builder', ['--version'])
            .execSync()
            .toString()
            .replace('flatpak-builder', '')
            .trim()
        console.log(`host flatpak-builder version: ${version}`)
        return true
    } catch (error) {
        console.log(`host flatpak-builder not found: ${error as string}`)
        return false
    }
})

/**
 * Whether flatpak-builder is installed as a Flatpak (org.flatpak.Builder)
 */
const FLATPAK_BUILDER_SANDBOXED_EXISTS = new Lazy(() => {
    try {
        const version = new Command('flatpak', ['run', 'org.flatpak.Builder', '--version'])
            .execSync()
            .toString()
            .replace('flatpak-builder', '')
            .trim()
        console.log(`flatpak-installed flatpak-builder version: ${version}`)
        return true
    } catch (error) {
        console.log(`flatpak-installed flatpak-builder not found: ${error as string}`)
        return false
    }
})

/**
 * Whether VSCode is running inside a container like Toolbx or distrobox
 */
const VSCODE_INSIDE_CONTAINER = new AsyncLazy(async () => {
    try {
        const containerEnv = '/run/.containerenv'
        if (await exists(containerEnv)) {
            console.log('VSCode is running inside a container')
            return true
        } else {
            return false
        }
    } catch (error) {
        console.log('Failed to check if running inside a container')
        return false
    }
})

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
        if (options?.forceSandbox || IS_SANDBOXED.get()) {
            this.program = 'flatpak-spawn'
            args.unshift('--host', '--watch-bus', '--env=TERM=xterm-256color', program)
        } else {
            this.program = program
        }
        this.args = args
        this.cwd = options?.cwd
    }

    static async flatpakBuilder(args: string[], options?: CommandOptions): Promise<Command> {
        // flatpak-builder requires --disable-rofiles-fuse when running inside a container
        if (await VSCODE_INSIDE_CONTAINER.get()) {
            args = [...args, '--disable-rofiles-fuse']
        }

        if (FLATPAK_BUILDER_HOST_EXISTS.get()) {
            return new Command('flatpak-builder', args, options)
        } else if (FLATPAK_BUILDER_SANDBOXED_EXISTS.get()) {
            return new Command('flatpak', ['run', 'org.flatpak.Builder', ...args], options)
        } else {
            // User may have installed either after receiving the error
            // so invalidate to check again if either now exists
            FLATPAK_BUILDER_HOST_EXISTS.reset()
            FLATPAK_BUILDER_SANDBOXED_EXISTS.reset()

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
     * @returns the process
     */
    spawn(terminal: OutputTerminal, token: CancellationToken): Promise<pty.IPty> {
        const iPty = pty.spawn(this.program, this.args, {
            cwd: this.cwd,
            cols: terminal.dimensions?.columns,
            rows: terminal.dimensions?.rows,
        })

        const onDidSetDimensionsHandler = terminal.onDidSetDimensions((dimensions) => {
            iPty.resize(dimensions.columns, dimensions.rows)
        })

        iPty.onData((data) => {
            terminal.append(data)
        })

        return new Promise((resolve, reject) => {
            token.onCancellationRequested(() => {
                iPty.kill('SIGINT')
            })

            iPty.onExit(({ exitCode, signal }) => {
                onDidSetDimensionsHandler.dispose()

                if (exitCode !== 0) {
                    reject(new Error(`Child process exited with code ${exitCode}`))
                    return
                }

                if (signal === 2) {  // SIGINT
                    reject(new Canceled())
                    return
                }

                resolve(iPty)
            })
        })
    }
}

