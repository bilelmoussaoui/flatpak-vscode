import { promises as fs } from 'fs'
import * as pty from './nodePty'

export class Command {
    name: string
    cwd?: string
    arguments: string[]
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

    // Store the command as a bash script and returns it path
    async save(output: string): Promise<void> {
        const cmd = ['#!/bin/sh', '', `${this.toString()} "$@"`].join('\n')
        await fs.writeFile(output, cmd)
        await fs.chmod(output, 0o755)
    }

    run(): pty.IPty {
        if (this.isSandboxed) {
            return pty.spawn(
                'flatpak-spawn',
                ['--host', this.name, ...this.arguments],
                {
                    cwd: this.cwd,
                }
            )
        } else {
            return pty.spawn(this.name, this.arguments, {
                cwd: this.cwd,
            })
        }
    }
}
