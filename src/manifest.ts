import * as vscode from 'vscode'
import { BuildOptionsPathKeys, ManifestSchema, Module, SdkExtension } from './flatpak.types'
import * as path from 'path'
import { arch, cpus } from 'os'
import * as fs from 'fs/promises'
import { Command } from './command'
import { generatePathOverride, getA11yBusArgs, getFontsArgs, getHostEnv } from './utils'
import { versionCompare } from './flatpakUtils'
import { checkForMissingRuntimes } from './manifestUtils'
import { Lazy } from './lazy'

/**
 * Version of currently installed Flatpak in host
 */
export const FLATPAK_VERSION = new Lazy(() => {
    const version = new Command('flatpak', ['--version'])
        .execSync()
        .toString()
        .replace('Flatpak', '')
        .trim()
    console.log(`Flatpak version: '${version}'`)
    return version
})

const DEFAULT_BUILD_SYSTEM_BUILD_DIR = '_build'

export class Manifest {
    readonly uri: vscode.Uri
    readonly manifest: ManifestSchema
    private readonly repoDir: string
    private readonly finializedRepoDir: string
    private readonly ostreeRepoPath: string
    private fontsArgs: string[]
    private a11yBusArgs: string[]
    readonly buildDir: string
    readonly workspace: string
    readonly stateDir: string
    readonly requiredVersion?: string

    constructor(
        uri: vscode.Uri,
        manifest: ManifestSchema,
    ) {
        this.uri = uri
        this.manifest = manifest
        this.workspace = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath || ''
        this.buildDir = path.join(this.workspace, '.flatpak')
        this.repoDir = path.join(this.buildDir, 'repo')
        this.finializedRepoDir = path.join(this.buildDir, 'finalized-repo')
        this.ostreeRepoPath = path.join(this.buildDir, 'ostree-repo')
        this.stateDir = path.join(this.buildDir, 'flatpak-builder')
        this.requiredVersion = (manifest['finish-args'] || []).map((val) => val.split('=')).find((value) => {
            return value[0] === '--require-version'
        })?.[1]
        this.fontsArgs = []
        this.a11yBusArgs = []
    }

    async isBuildInitialized(): Promise<boolean> {
        const repoDir = vscode.Uri.file(this.repoDir)
        const metadataFile = vscode.Uri.joinPath(repoDir, 'metadata')
        const filesDir = vscode.Uri.joinPath(repoDir, 'files')
        const varDir = vscode.Uri.joinPath(repoDir, 'var')

        try {
            // From gnome-builder
            // https://gitlab.gnome.org/GNOME/gnome-builder/-/blob/8579055f5047a0af5462e8a587b0742014d71d64/src/plugins/flatpak/gbp-flatpak-pipeline-addin.c#L220
            return (await vscode.workspace.fs.stat(metadataFile)).type === vscode.FileType.File
                && (await vscode.workspace.fs.stat(filesDir)).type === vscode.FileType.Directory
                && (await vscode.workspace.fs.stat(varDir)).type === vscode.FileType.Directory
        } catch (err) {
            if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
                return false
            }

            throw err
        }
    }

    /**
     * Check for invalidity in the manifest
     * @returns an Error with a message if there is an error otherwise null
     */
    checkForError(): Error | null {
        if (this.requiredVersion !== undefined) {
            const flatpakVersion = FLATPAK_VERSION.get()
            if (!versionCompare(flatpakVersion, this.requiredVersion)) {
                return new Error(`Manifest requires ${this.requiredVersion} but ${flatpakVersion} is available.`)
            }
        }

        const missingRuntimes = checkForMissingRuntimes(this)
        if (missingRuntimes.length !== 0) {
            return new Error(`Manifest requires the following but are not installed: ${missingRuntimes.join(', ')}`)
        }

        return null
    }

    id(): string {
        return this.manifest['app-id'] || this.manifest.id || 'org.flatpak.Test'
    }

    sdkExtensions(): SdkExtension[] {
        const rawSdkExtensions = this.manifest['sdk-extensions']

        if (rawSdkExtensions === undefined) {
            return []
        }

        const sdkExtensions: SdkExtension[] = []
        for (const rawSdkExtension of rawSdkExtensions) {
            const suffix = rawSdkExtension.split('.').pop()

            if (suffix === undefined) {
                continue
            }

            switch (suffix) {
                case 'rust-stable':
                    sdkExtensions.push('rust-stable')
                    break
                case 'rust-nightly':
                    sdkExtensions.push('rust-nightly')
                    break
                case 'vala':
                    sdkExtensions.push('vala')
                    break
                default:
                    console.warn(`SDK extension '${suffix}' was not handled`)
            }
        }

        return sdkExtensions
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
        return (this.manifest['finish-args'] || [])
            .filter((arg) => {
                // --metadata causes a weird issue
                // --require-version is not supported by flatpak-builder, so filter it out
                return !['--metadata', '--require-version'].includes(arg.split('=')[0])
            })
    }

    runtimeTerminal(): vscode.TerminalOptions {
        const sdkId = `${this.manifest.sdk}//${this.manifest['runtime-version']}`
        const command = new Command('flatpak', [
            'run',
            '--command=bash',
            sdkId,
        ])
        return {
            name: sdkId,
            iconPath: new vscode.ThemeIcon('package'),
            shellPath: command.program,
            shellArgs: command.args
        }
    }

    async buildTerminal(): Promise<vscode.TerminalOptions> {
        const command = await this.runInRepo('bash', true)
        return {
            name: this.id(),
            iconPath: new vscode.ThemeIcon('package'),
            shellPath: command.program,
            shellArgs: command.args,
        }
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
            { cwd: this.workspace },
        )
    }

    async updateDependencies(): Promise<Command> {
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

        return await Command.flatpakBuilder(
            args,
            { cwd: this.workspace },
        )
    }

    async buildDependencies(): Promise<Command> {
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

        return await Command.flatpakBuilder(
            args,
            { cwd: this.workspace },
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
    getPathOverrides(envVariable: string, defaultValue: string[], prependOption: BuildOptionsPathKeys, appendOption: BuildOptionsPathKeys): string {
        const module = this.module()
        const prependPaths = [
            this.manifest['build-options']?.[prependOption],
            module['build-options']?.[prependOption]
        ]
        const appendPaths = [
            this.manifest['build-options']?.[appendOption],
            module['build-options']?.[appendOption]
        ]
        const currentValue = process.env[envVariable]
        const path = generatePathOverride(currentValue, defaultValue, prependPaths, appendPaths)
        return `--env=${envVariable}=${path}`
    }

    getPaths(): string[] {
        const paths: string[] = []
        paths.push(
            this.getPathOverrides('PATH',
                ['/app/bin', '/usr/bin'],
                'prepend-path', 'append-path'
            )
        )
        paths.push(
            this.getPathOverrides('LD_LIBRARY_PATH',
                ['/app/lib'],
                'prepend-ld-library-path',
                'append-ld-library-path'
            )
        )
        paths.push(
            this.getPathOverrides('PKG_CONFIG_PATH',
                [
                    '/app/lib/pkgconfig',
                    '/app/share/pkgconfig',
                    '/usr/lib/pkgconfig',
                    '/usr/share/pkgconfig'
                ],
                'prepend-pkg-config-path',
                'append-pkg-config-path'
            )
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
        )

        let commands = []
        switch (module.buildsystem) {
            default:
            case 'autotools':
                commands = this.getAutotoolsCommands(rebuild, buildArgs, configOpts)
                break
            case 'cmake':
            case 'cmake-ninja':
                commands = this.getCmakeCommands(rebuild, buildArgs, configOpts)
                break
            case 'meson':
                commands = this.getMesonCommands(rebuild, buildArgs, configOpts)
                break
            case 'simple':
                commands = this.getSimpleCommands(module.name, module['build-commands'], buildArgs)
                break
            case 'qmake':
                throw new Error('Qmake is not implemented yet')
        }
        /// Add the post-install commands if there are any
        commands.push(
            ... this.getSimpleCommands(this.module().name, this.module()['post-install'] || [], buildArgs)
        )
        return commands
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
        configOpts: string[]
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
                        ...configOpts,
                    ],
                    { cwd: this.workspace },
                )
            )
        }
        commands.push(
            new Command(
                'flatpak',
                ['build', ...buildArgs, this.repoDir, 'make', '-p', '-n', '-s'],
                { cwd: this.workspace },
            )
        )

        commands.push(
            new Command(
                'flatpak',
                ['build', ...buildArgs, this.repoDir, 'make', 'V=0', `-j${numCPUs}`, 'install'],
                { cwd: this.workspace },
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
        configOpts: string[]
    ): Command[] {
        const commands: Command[] = []
        const cmakeBuildDir = DEFAULT_BUILD_SYSTEM_BUILD_DIR
        buildArgs.push(`--filesystem=${this.workspace}/${cmakeBuildDir}`)
        if (!rebuild) {
            commands.push(
                new Command(
                    'mkdir',
                    ['-p', cmakeBuildDir],
                    { cwd: this.workspace },
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
                        ...configOpts,
                    ],
                    { cwd: path.join(this.workspace, cmakeBuildDir) },
                )
            )
        }
        commands.push(
            new Command(
                'flatpak',
                ['build', ...buildArgs, this.repoDir, 'ninja'],
                { cwd: path.join(this.workspace, cmakeBuildDir) },
            )
        )

        commands.push(
            new Command(
                'flatpak',
                ['build', ...buildArgs, this.repoDir, 'ninja', 'install'],
                { cwd: path.join(this.workspace, cmakeBuildDir) },
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
        configOpts: string[]
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
                        'setup',
                        '--prefix',
                        '/app',
                        mesonBuildDir,
                        ...configOpts,
                    ],
                    { cwd: this.workspace },
                )
            )
        }
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
                { cwd: this.workspace },
            )
        )
        return commands
    }

    getSimpleCommands(moduleName: string, buildCommands: string[], buildArgs: string[]): Command[] {
        return buildCommands.map((command) => {
            const commandArgs = command.replace('${FLATPAK_ID}', this.id())
                .replace('${FLATPAK_ARCH}', arch())
                .replace('${FLATPAK_DEST}', '/app') // We only support applications
                .replace('${FLATPAK_BUILDER_N_JOBS}', cpus().length.toString())
                .replace('${FLATPAK_BUILDER_BUILDDIR}', `/run/build/${moduleName}`)
                .split(' ').filter((v) => !!v)
            return new Command(
                'flatpak',
                ['build', ...buildArgs, this.repoDir, ...commandArgs],
                { cwd: this.workspace },
            )
        })
    }

    async bundle(): Promise<Command[]> {
        const commands = []
        await fs.rm(this.finializedRepoDir, {
            recursive: true,
            force: true,
        })

        commands.push(new Command('cp', [
            '-r',
            this.repoDir,
            this.finializedRepoDir,
        ]))

        commands.push(new Command('flatpak', [
            'build-finish',
            ...this.finishArgs(),
            `--command=${this.manifest.command}`,
            this.finializedRepoDir,
        ], { cwd: this.workspace }))

        commands.push(new Command('flatpak', [
            'build-export',
            this.ostreeRepoPath,
            this.finializedRepoDir,
        ], { cwd: this.workspace }))

        commands.push(new Command('flatpak', [
            'build-bundle',
            this.ostreeRepoPath,
            `${this.id()}.flatpak`,
            this.id(),
        ], { cwd: this.workspace }))

        return commands
    }

    async run(): Promise<Command> {
        return this.runInRepo([this.manifest.command, ...(this.manifest['x-run-args'] || [])].join(' '), false)
    }

    async runInRepo(shellCommand: string, mountExtensions: boolean, additionalEnvVars?: Map<string, string>): Promise<Command> {
        const uid = process.geteuid ? process.geteuid() : 1000
        const appId = this.id()
        if (this.fontsArgs.length === 0) {
            this.fontsArgs = await getFontsArgs()
        }
        if (this.a11yBusArgs.length === 0) {
            this.a11yBusArgs = await getA11yBusArgs()
        }
        let args = [
            'build',
            '--with-appdir',
            '--allow=devel',
            `--bind-mount=/run/user/${uid}/doc=/run/user/${uid}/doc/by-app/${appId}`,
            ...this.finishArgs(),
            '--talk-name=org.freedesktop.portal.*',
            '--talk-name=org.a11y.Bus',
        ]
        args.push(...this.a11yBusArgs)

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
        args.push(...this.fontsArgs)

        args.push(this.repoDir)
        args.push(shellCommand)
        return new Command('flatpak', args, { cwd: this.workspace })
    }

    async deleteRepoDir(): Promise<void> {
        await fs.rm(this.repoDir, {
            recursive: true,
            force: true,
        })
    }

    async overrideWorkspaceCommandConfig(
        section: string,
        configName: string,
        program: string,
        binaryPath?: string,
        additionalEnvVars?: Map<string, string>,
    ): Promise<void> {
        const commandPath = path.join(this.buildDir, `${program}.sh`)
        const command = await this.runInRepo(`${binaryPath || ''}${program}`, true, additionalEnvVars)
        await command.saveAsScript(commandPath)
        const commandPathSettingsValue = commandPath.replace(this.workspace, '${workspaceFolder}')
        await this.overrideWorkspaceConfig(section, configName, commandPathSettingsValue)
    }

    async overrideWorkspaceConfig(
        section: string,
        configName: string,
        value?: string | string[] | boolean
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration(section)
        await config.update(configName, value)
    }

    async restoreWorkspaceConfig(
        section: string,
        configName: string,
    ): Promise<void> {
        await this.overrideWorkspaceConfig(section, configName, undefined)
    }
}
