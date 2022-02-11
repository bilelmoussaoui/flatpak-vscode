import { promises as fs } from 'fs'
import * as childProcess from 'child_process'
import { findInPath } from './utils'

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

    async run(): Promise<childProcess.ChildProcessWithoutNullStreams> {
        let proc
        const bash = await findInPath('bash') || '/usr/bin/bash'
        if (this.isSandboxed) {
            proc = childProcess.spawn(
                'flatpak-spawn',
                ['--host', this.name, ...this.arguments],
                {
                    cwd: this.cwd,
                    shell: bash,
                }
            )
        } else {
            proc = childProcess.spawn(this.name, this.arguments, {
                cwd: this.cwd,
                shell: bash,
            })
        }
        return proc
    }
}
