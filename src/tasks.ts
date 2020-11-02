import * as path from 'path'
import {
  Task,
  Uri,
  TaskGroup,
  TaskScope,
  ShellExecution,
  TaskProvider,
  tasks,
  ProviderResult,
} from 'vscode'
import { FlatpakManifest, Module } from './flatpak.types'
import { createTask, getBuildDir, getWorkspacePath } from './utils'

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
): [string[][], string[][]] => {
  let buildAppCommand: string[][] = []
  let rebuildAppCommand: string[][] = []
  const configOpts = (module['config-opts'] || []).join(' ')

  switch (module.buildsystem) {
    case 'meson':
      {
        const mesonBuildDir = '_build'
        buildArgs.push(`--filesystem=${workspace}/${mesonBuildDir}`)
        rebuildAppCommand = [
          ['build', ...buildArgs, buildDir, 'ninja', '-C', mesonBuildDir],
          [
            'build',
            ...buildArgs,
            buildDir,
            'meson',
            'install',
            '-C',
            mesonBuildDir,
          ],
        ]
        buildAppCommand = [
          [
            'build',
            ...buildArgs,
            buildDir,
            'meson',
            '--prefix',
            '/app',
            mesonBuildDir,
            configOpts,
          ],
          ...rebuildAppCommand,
        ]
      }
      break
    case 'simple':
      {
        const buildCommands = module['build-commands'].map((command) => {
          return ['build', ...buildArgs, buildDir, command]
        })
        rebuildAppCommand = buildCommands
        buildAppCommand = buildCommands
      }
      break
  }
  return [buildAppCommand, rebuildAppCommand]
}

export const getTasks = (manifest: FlatpakManifest, uri: Uri): Task[] => {
  const appId = manifest.id || manifest['app-id'] || 'org.flatpak.Test'
  const branch = manifest.branch || 'master'
  const lastModule = manifest.modules.slice(-1)[0]
  const moduleName = lastModule.name
  const uid = process.getuid()
  const workspacePath = getWorkspacePath(uri)
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

  const buildInit = createTask(
    TaskMode.buildInit,
    'Build Init',
    'Prepare the Flatpak build directory',
    'flatpak',
    [['build-init', buildDir, appId, manifest.sdk, manifest.runtime, branch]],
    workspacePath
  )

  const updateDependencies = createTask(
    TaskMode.updateDeps,
    'Update dependencies',
    'Update the dependencies the Flatpak build directory',
    'flatpak-builder',
    [
      [
        '--ccache',
        '--force-clean',
        '--disable-updates',
        '--download-only',
        `--state-dir=${stateDir}`,
        `--stop-at=${moduleName}`,
        buildDir,
        uri.fsPath,
      ],
    ],
    workspacePath
  )

  const buildDependencies = createTask(
    TaskMode.buildDeps,
    'Build',
    'Build the dependencies of the Flatpak',
    'flatpak-builder',
    [
      [
        '--ccache',
        '--force-clean',
        '--disable-updates',
        '--disable-download',
        '--build-only',
        `--state-dir=${stateDir}`,
        '--keep-build-dirs',
        `--stop-at=${moduleName}`,
        buildDir,
        uri.fsPath,
      ],
    ],
    workspacePath
  )
  buildDependencies.group = TaskGroup.Build

  const buildApp = createTask(
    TaskMode.buildApp,
    'Build',
    'Build the application',
    'flatpak',
    buildAppCommand,
    workspacePath
  )
  buildApp.group = TaskGroup.Build

  const rebuildApp = createTask(
    TaskMode.rebuild,
    'Rebuild',
    'Rebuild the application',
    'flatpak',
    rebuildAppCommand,
    workspacePath
  )
  rebuildApp.group = TaskGroup.Build

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

  const run = createTask(
    TaskMode.run,
    'Run',
    'Build the application and run it',
    'flatpak',
    [
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
    ],
    workspacePath
  )

  const exportBundle = new Task(
    {
      type: 'flatpak',
      mode: TaskMode.export,
    },
    TaskScope.Workspace,
    'Build the application and export it as a bundle',
    'Export bundle',
    new ShellExecution('print "hey"')
  )

  return [
    buildInit,
    buildDependencies,
    buildApp,
    run,
    rebuildApp,
    exportBundle,
    updateDependencies,
  ]
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
