import * as path from 'path'
import {
  Task,
  Uri,
  TaskProvider,
  tasks,
  ProviderResult,
} from 'vscode'
import { FlatpakManifest, Module } from './flatpak.types'
import { createTask, getBuildDir, getWorkspacePath } from './utils'
import { Command } from './terminal'
import { getuid } from 'process'

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

export const getBuildAppCommand = (
  module: Module,
  workspace: string,
  buildDir: string,
  buildArgs: string[]
): [Command[], Command[]] => {
  let buildAppCommand: Command[] = []
  let rebuildAppCommand: Command[] = []
  const configOpts = (module['config-opts'] || []).join(' ')

  switch (module.buildsystem) {
    case 'meson':
      {
        const mesonBuildDir = '_build'
        buildArgs.push(`--filesystem=${workspace}/${mesonBuildDir}`)
        rebuildAppCommand = [
          new Command('flatpak', [
            'build',
            ...buildArgs,
            buildDir,
            'ninja',
            '-C',
            mesonBuildDir,
          ]),
          new Command('flatpak', [
            'build',
            ...buildArgs,
            buildDir,
            'meson',
            'install',
            '-C',
            mesonBuildDir,
          ]),
        ]

        buildAppCommand = [
          new Command('flatpak', [
            'build',
            ...buildArgs,
            buildDir,
            'meson',
            '--prefix',
            '/app',
            mesonBuildDir,
            configOpts,
          ]),
          ...rebuildAppCommand,
        ]
      }
      break
    case 'simple':
      {
        const buildCommands = module['build-commands'].map((command) => {
          return new Command('flatpak', [
            'build',
            ...buildArgs,
            buildDir,
            command,
          ])
        })
        rebuildAppCommand = buildCommands
        buildAppCommand = buildCommands
      }
      break
  }
  return [buildAppCommand, rebuildAppCommand]
}

export const getTasks = (manifest: FlatpakManifest, uri: Uri): Task[] => {
  const lastModule = manifest.modules.slice(-1)[0]
  const moduleName = lastModule.name
  const workspacePath = getWorkspacePath(uri)
  console.log(workspacePath)
  const buildDir = path.join(getBuildDir(workspacePath), 'repo')
  const stateDir = path.join(getBuildDir(workspacePath), 'flatpak-builder')

  const buildEnv = manifest['build-options']?.env || {}
  const buildArgs = [
    '--share=network',
    '--nofilesystem=host',
    `--filesystem=${workspacePath}`,
    `--filesystem=${buildDir}`,
  ]
  const sdkPath = manifest['build-options']?.['append-path']
  if (sdkPath) {
    buildArgs.push(`--env=PATH=$PATH:${sdkPath}`)
  }

  for (const [key, value] of Object.entries(buildEnv)) {
    buildArgs.push(`--env=${key}=${value}`)
  }

  const [buildAppCommand, rebuildAppCommand] = getBuildAppCommand(
    lastModule,
    workspacePath,
    buildDir,
    buildArgs
  )
  return []
}

export const exportBundle = (): Command => {
  return new Command('flatpak-builder', [])
}

export const buildDependencies = (manifestPath: string, buildDir: string, cwd: string, stateDir?: string, stopAt?: string): Command => {
  const args = [
    '--ccache',
    '--force-clean',
    '--disable-updates',
    '--disable-download',
    '--build-only',
    '--keep-build-dirs',
  ]
  if (stateDir) {
    args.push(`--state-dir=${stateDir}`)
  }
  if (stopAt) {
    args.push(`--stop-at=${stopAt}`)
  }
  args.push(buildDir)
  args.push(manifestPath)

  return new Command('flatpak-builder', args, cwd)
}

export const updateDependencies = (manifestPath: string, buildDir: string, cwd: string, stateDir?: string, stopAt?: string): Command => {
  const args = [
    '--ccache',
    '--force-clean',
    '--disable-updates',
    '--disable-download',
    '--build-only',
    '--keep-build-dirs',
  ]
  if (stateDir) {
    args.push(`--state-dir=${stateDir}`)
  }
  if (stopAt) {
    args.push(`--stop-at=${stopAt}`)
  }
  args.push(buildDir)
  args.push(manifestPath)
  return new Command(
    'flatpak-builder',
    args,
    cwd
  )
}

export const buildInit = (manifest: FlatpakManifest, buildDir: string, cwd: string): Command => {
  const appId = manifest['app-id'] || manifest.id || 'org.flatpak.Test'
  return new Command(
    'flatpak',
    [
      'build-init',
      buildDir,
      appId,
      manifest.sdk,
      manifest.runtime,
      manifest['runtime-version'],
    ],
    cwd
  )
}

export const run = (
  manifest: FlatpakManifest,
  buildDir: string,
  cwd: string
): Command => {
  const appId = manifest['app-id'] || manifest.id || 'org.flatpak.Test'
  const uid = getuid()
  const finishArgs = manifest['finish-args']
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

  return new Command(
    'flatpak',
    [
      'build',
      '--with-appdir',
      '--allow=devel',
      `--bind-mount=/run/user/${uid}/doc=/run/user/${uid}/doc/by-app/${appId}`,
      ...finishArgs,
      "--talk-name='org.freedesktop.portal.*'",
      '--talk-name=org.a11y.Bus',
      buildDir,
      manifest.command,
    ],
    cwd
  )
}

export async function getTask(mode: TaskMode): Promise<Task> {
  const flatpakTasks = await tasks.fetchTasks({ type: 'flatpak' })
  const filtered = flatpakTasks.filter((t) => t.definition.mode === mode)
  if (filtered.length === 0) {
    throw new Error(`Cannot find ${mode} task`)
  }
  return filtered[0]
}

export class FlatpakTaskProvider implements TaskProvider {
  private manifest: FlatpakManifest
  private uri: Uri

  constructor(manifest: FlatpakManifest, uri: Uri) {
    this.manifest = manifest
    this.uri = uri
  }

  provideTasks(): ProviderResult<Task[]> {
    return getTasks(this.manifest, this.uri)
  }
  resolveTask(): ProviderResult<Task> {
    return undefined
  }
}
