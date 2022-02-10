import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as readline from 'readline'
import { failure, finished } from './store'
import { BuildOptionsPathKeys, FlatpakManifestSchema, Module } from './flatpak.types'
import * as path from 'path'
import { getuid } from 'process'
import { promises as fs } from 'fs'
import { findInPath, generatePathOverride, getHostEnv } from './utils'
import { cpus } from 'os'

const DEFAULT_BUILD_SYSTEM_BUILD_DIR = '_build'

export enum TaskMode {
  buildInit = 'build-init',
  updateDeps = 'update-deps',
  buildDeps = 'build-deps',
  buildApp = 'build-app',
  rebuild = 'rebuild',
  run = 'run',
  export = 'export',
  clean = 'clean',
}

export class FlatpakManifest {
  uri: vscode.Uri
  manifest: FlatpakManifestSchema
  repoDir: string
  buildDir: string
  workspace: string
  stateFile: string // A on disk copy of the pipeline state
  stateDir: string
  isSandboxed: boolean

  constructor(
    uri: vscode.Uri,
    manifest: FlatpakManifestSchema,
    isSandboxed: boolean
  ) {
    this.uri = uri
    this.manifest = manifest
    this.workspace = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath || ''
    this.buildDir = path.join(this.workspace, '.flatpak')
    this.repoDir = path.join(this.buildDir, 'repo')
    this.stateDir = path.join(this.buildDir, 'flatpak-builder')
    this.stateFile = path.join(this.buildDir, 'pipeline.json')
    this.isSandboxed = isSandboxed
  }

  id(): string {
    return this.manifest['app-id'] || this.manifest.id || 'org.flatpak.Test'
  }

  sdk(): string | null {
    const sdkPath = this.manifest['build-options']?.['append-path']
    if (sdkPath?.includes('rust')) {
      return 'rust'
    }
    return null
  }

  /**
   * Returns the the latest Flatpak module
   */
  module(): Module {
    return this.manifest.modules.slice(-1)[0]
  }

  /**
   * Returns the manifest path
   */
  path(): string {
    return this.uri.fsPath
  }

  finishArgs(): string[] {
    return this.manifest['finish-args']
      .filter((arg) => {
        // --metadata causes a weird issue
        return arg.split('=')[0] !== '--metadata'
      })
      .map((arg) => {
        if (arg.endsWith('*')) {
          const [key, value] = arg.split('=')
          return `${key}='${value}'`
        }
        return arg
      })
  }

  runtimeTerminal(): Command {
    return new Command(
      'flatpak',
      [
        'run',
        '--command=bash',
        `${this.manifest.sdk}//${this.manifest['runtime-version']}`,
      ],
      this.workspace,
      this.isSandboxed
    )
  }

  buildTerminal(): Command {
    return this.runInRepo('bash', true)
  }

  initBuild(): Command {
    return new Command(
      'flatpak',
      [
        'build-init',
        this.repoDir,
        this.id(),
        this.manifest.sdk,
        this.manifest.runtime,
        this.manifest['runtime-version'],
      ],
      this.workspace,
      this.isSandboxed
    )
  }

  updateDependencies(): Command {
    const args = [
      '--ccache',
      '--force-clean',
      '--disable-updates',
      '--download-only',
    ]
    args.push(`--state-dir=${this.stateDir}`)
    args.push(`--stop-at=${this.module().name}`)
    args.push(this.repoDir)
    args.push(this.path())

    return new Command(
      'flatpak-builder',
      args,
      this.workspace,
      this.isSandboxed
    )
  }

  buildDependencies(): Command {
    const args = [
      '--ccache',
      '--force-clean',
      '--disable-updates',
      '--disable-download',
      '--build-only',
      '--keep-build-dirs',
    ]
    args.push(`--state-dir=${this.stateDir}`)
    args.push(`--stop-at=${this.module().name}`)
    args.push(this.repoDir)
    args.push(this.path())

    return new Command(
      'flatpak-builder',
      args,
      this.workspace,
      this.isSandboxed
    )
  }

  /**
   * Generate a new PATH like override
   * @param envVariable the env variable name
   * @param defaultValue the default value
   * @param prependOption an array of the paths to pre-append
   * @param appendOption an array of the paths to append
   * @returns the new path
   */
  getPathOverrides(envVariable: string, defaultValue: string, prependOption: BuildOptionsPathKeys, appendOption: BuildOptionsPathKeys): string {
    const module = this.module()
    const prependPaths = [
      this.manifest['build-options']?.[prependOption],
      module['build-options']?.[prependOption]
    ]
    const appendPaths = [
      this.manifest['build-options']?.[appendOption],
      module['build-options']?.[appendOption]
    ]
    const currentValue = process.env[envVariable] || defaultValue
    const path = generatePathOverride(currentValue, prependPaths, appendPaths)
    return `--env=${envVariable}=${path}`
  }

  getPaths(): string[] {
    const paths: string[] = []
    paths.push(
      this.getPathOverrides('PATH', '', 'prepend-path', 'append-path')
    )
    paths.push(
      this.getPathOverrides('LD_LIBRARY_PATH', '/app/lib', 'prepend-ld-library-path', 'append-ld-library-path')
    )
    paths.push(
      this.getPathOverrides('PKG_CONFIG_PATH', '/app/lib/pkgconfig:/app/share/pkgconfig:/usr/lib/pkgconfig:/usr/share/pkgconfig', 'prepend-pkg-config-path', 'append-pkg-config-path')
    )
    return paths
  }

  build(rebuild: boolean): Command[] {
    const module = this.module()
    const buildEnv = {
      ...this.manifest['build-options']?.env || {},
      ...module['build-options']?.env || {},
    }
    let buildArgs = [
      '--share=network',
      '--nofilesystem=host',
      `--filesystem=${this.workspace}`,
      `--filesystem=${this.repoDir}`,
    ]

    for (const [key, value] of Object.entries(buildEnv)) {
      buildArgs.push(`--env=${key}=${value}`)
    }
    buildArgs = buildArgs.concat(this.getPaths())

    const configOpts = (
      (module['config-opts'] || []).concat(
        this.manifest['build-options']?.['config-opts'] || []
      )
    ).join(' ')

    switch (module.buildsystem) {
      case undefined:
      case 'autotools':
        return this.getAutotoolsCommands(rebuild, buildArgs, configOpts)
      case 'cmake':
      case 'cmake-ninja':
        return this.getCmakeCommands(rebuild, buildArgs, configOpts)
      case 'meson':
        return this.getMesonCommands(rebuild, buildArgs, configOpts)
      case 'simple':
        return this.getSimpleCommands(module['build-commands'], buildArgs)
      case 'qmake':
        throw new Error('Qmake is not implemented yet')
    }
    throw new Error('Failed to build application')
  }

  buildSystemBuildDir(): string | null {
    const module = this.module()
    switch (module.buildsystem) {
      case 'meson':
      case 'cmake':
      case 'cmake-ninja':
        return DEFAULT_BUILD_SYSTEM_BUILD_DIR
    }
    return null
  }

  /**
  * Gets an array of commands for a autotools build
  * - If the app is being rebuilt
  *   - Configure with `configure`
  * - Build with `make`
  * - Install with `make install`
  * @param  {string}     rebuild     Whether this is a rebuild
  * @param  {string[]}   buildArgs   The build arguments
  * @param  {string}     configOpts  The configuration options
  */
  getAutotoolsCommands(
    rebuild: boolean,
    buildArgs: string[],
    configOpts: string
  ): Command[] {
    const numCPUs = cpus().length
    const commands: Command[] = []
    if (!rebuild) {
      commands.push(
        new Command(
          'flatpak',
          [
            'build',
            ...buildArgs,
            this.repoDir,
            './configure',
            '--prefix=/app',
            configOpts,
          ],
          path.join(this.workspace),
          this.isSandboxed
        )
      )
    }
    commands.push(
      new Command(
        'flatpak',
        ['build', ...buildArgs, this.repoDir, 'make', '-p', '-n', '-s'],
        path.join(this.workspace),
        this.isSandboxed
      )
    )

    commands.push(
      new Command(
        'flatpak',
        ['build', ...buildArgs, this.repoDir, 'make', 'V=0', `-j${numCPUs}`, 'install'],
        path.join(this.workspace),
        this.isSandboxed
      )
    )
    return commands
  }

  /**
   * Gets an array of commands for a cmake build
   * - If the app is being rebuilt
   *   - Ensure build dir exists
   *   - Configure with `cmake -G NINJA`
   * - Build with `ninja`
   * - Install with `ninja install`
   * @param  {string}     rebuild     Whether this is a rebuild
   * @param  {string[]}   buildArgs   The build arguments
   * @param  {string}     configOpts  The configuration options
   */
  getCmakeCommands(
    rebuild: boolean,
    buildArgs: string[],
    configOpts: string
  ): Command[] {
    const commands: Command[] = []
    const cmakeBuildDir = DEFAULT_BUILD_SYSTEM_BUILD_DIR
    buildArgs.push(`--filesystem=${this.workspace}/${cmakeBuildDir}`)
    if (!rebuild) {
      commands.push(
        new Command(
          'mkdir',
          ['-p', cmakeBuildDir],
          this.workspace,
          this.isSandboxed
        )
      )
      commands.push(
        new Command(
          'flatpak',
          [
            'build',
            ...buildArgs,
            this.repoDir,
            'cmake',
            '-G',
            'Ninja',
            '..',
            '.',
            '-DCMAKE_EXPORT_COMPILE_COMMANDS=1',
            '-DCMAKE_BUILD_TYPE=RelWithDebInfo',
            '-DCMAKE_INSTALL_PREFIX=/app',
            configOpts,
          ],
          path.join(this.workspace, cmakeBuildDir),
          this.isSandboxed
        )
      )
    }
    commands.push(
      new Command(
        'flatpak',
        ['build', ...buildArgs, this.repoDir, 'ninja'],
        path.join(this.workspace, cmakeBuildDir),
        this.isSandboxed
      )
    )

    commands.push(
      new Command(
        'flatpak',
        ['build', ...buildArgs, this.repoDir, 'ninja', 'install'],
        path.join(this.workspace, cmakeBuildDir),
        this.isSandboxed
      )
    )
    return commands
  }

  /**
   * Gets an array of commands for a meson build
   * - If the app is being rebuilt
   *   - Configure with `meson`
   * - Build with `ninja`
   * - Install with `meson install`
   * @param  {string}     rebuild     Whether this is a rebuild
   * @param  {string[]}   buildArgs   The build arguments
   * @param  {string}     configOpts  The configuration options
   */
  getMesonCommands(
    rebuild: boolean,
    buildArgs: string[],
    configOpts: string
  ): Command[] {
    const commands: Command[] = []
    const mesonBuildDir = DEFAULT_BUILD_SYSTEM_BUILD_DIR
    buildArgs.push(`--filesystem=${this.workspace}/${mesonBuildDir}`)
    if (!rebuild) {
      commands.push(
        new Command(
          'flatpak',
          [
            'build',
            ...buildArgs,
            this.repoDir,
            'meson',
            '--prefix',
            '/app',
            mesonBuildDir,
            configOpts,
          ],
          this.workspace,
          this.isSandboxed
        )
      )
    }
    commands.push(
      new Command(
        'flatpak',
        ['build', ...buildArgs, this.repoDir, 'ninja', '-C', mesonBuildDir],
        this.workspace,
        this.isSandboxed
      )
    )
    commands.push(
      new Command(
        'flatpak',
        [
          'build',
          ...buildArgs,
          this.repoDir,
          'meson',
          'install',
          '-C',
          mesonBuildDir,
        ],
        this.workspace,
        this.isSandboxed
      )
    )
    return commands
  }

  getSimpleCommands(buildCommands: string[], buildArgs: string[]): Command[] {
    return buildCommands.map((command) => {
      return new Command(
        'flatpak',
        ['build', ...buildArgs, this.repoDir, command],
        this.workspace,
        this.isSandboxed
      )
    })
  }

  run(): Command {
    return this.runInRepo(this.manifest.command, false)
  }

  runInRepo(shellCommand: string, mountExtensions: boolean, additionalEnvVars?: Map<string, string>): Command {
    const uid = getuid()

    const appId = this.id()

    let args = [
      'build',
      '--with-appdir',
      '--allow=devel',
      `--bind-mount=/run/user/${uid}/doc=/run/user/${uid}/doc/by-app/${appId}`,
      ...this.finishArgs(),
      "--talk-name='org.freedesktop.portal.*'",
      '--talk-name=org.a11y.Bus',
    ]

    const envVars = getHostEnv()

    if (additionalEnvVars !== undefined) {
      for (const [key, value] of additionalEnvVars) {
        envVars.set(key, value)
      }
    }

    for (const [key, value] of envVars) {
      args.push(`--env=${key}=${value}`)
    }

    if (mountExtensions) {
      args = args.concat(this.getPaths())

      // Assume we might need network access by the executable
      args.push('--share=network')
    }

    args.push(this.repoDir)
    args.push(shellCommand)
    return new Command('flatpak', args, this.workspace, this.isSandboxed)
  }

  async overrideWorkspaceCommandConfig(
    section: string,
    configName: string,
    command: string,
    additionalEnvVars?: Map<string, string>,
  ): Promise<void> {
    const commandPath = path.join(this.buildDir, `${command}.sh`)
    await this.runInRepo(command, true, additionalEnvVars).save(commandPath)
    await this.overrideWorkspaceConfig(section, configName, commandPath)
  }

  async overrideWorkspaceConfig(
    section: string,
    configName: string,
    value: any
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(section)
    await config.update(configName, value)
  }
  async restoreWorkspaceConfig(
    section: string,
    configName: string,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(section)
    await config.update(configName, undefined)
  }
}
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

  // Store the command as a bash script and returns it path
  async save(output: string): Promise<void> {
    const cmd = ['#!/bin/sh', '', `${this.toString()} "$@"`].join('\n')
    await fs.writeFile(output, cmd)
    await fs.chmod(output, 0o755)
  }

  async run(): Promise<child_process.ChildProcessWithoutNullStreams> {
    let proc
    const bash = await findInPath('bash') || '/usr/bin/bash'
    if (this.isSandboxed) {
      proc = child_process.spawn(
        'flatpak-spawn',
        ['--host', this.name, ...this.arguments],
        {
          cwd: this.cwd,
          shell: bash,
        }
      )
    } else {
      proc = child_process.spawn(this.name, this.arguments, {
        cwd: this.cwd,
        shell: bash,
      })
    }
    return proc
  }
}

export class FlatpakTaskTerminal {
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
          this.onError('', this.current())
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
