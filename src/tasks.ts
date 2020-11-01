import * as path from 'path'
import * as vscode from 'vscode'
import { FlatpakManifest, Module } from './flatpak.types'
import { createTask } from './utils'

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

export const getTasks = (
  manifest: FlatpakManifest,
  uri: vscode.Uri
): vscode.Task[] => {
  const appId = manifest.id || manifest['app-id'] || 'org.flatpak.Test'
  const branch = manifest.branch || 'master'
  const lastModule = manifest.modules.slice(-1)[0]
  const moduleName = lastModule.name
  const uid = 1000
  const workspace = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath || '/'
  const buildDir = path.join(workspace, '.flatpak', 'repo')
  const stateDir = path.join(workspace, '.flatpak', 'flatpak-builder')
  const cmdEnv = {
    cwd: workspace,
  }

  const buildEnv = manifest['build-options']?.env || {}
  const buildArgs = [
    '--share=network',
    '--nofilesystem=host',
    `--filesystem=${workspace}`,
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
    workspace,
    buildDir,
    buildArgs
  )

  const buildInit = createTask(
    TaskMode.buildInit,
    'Build Init',
    'Prepare the Flatpak build directory',
    'flatpak',
    [['build-init', buildDir, appId, manifest.sdk, manifest.runtime, branch]],
    cmdEnv
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
    cmdEnv
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
    cmdEnv
  )
  buildDependencies.group = vscode.TaskGroup.Build

  const buildApp = createTask(
    TaskMode.buildApp,
    'Build',
    'Build the application',
    'flatpak',
    buildAppCommand,
    cmdEnv
  )
  buildApp.group = vscode.TaskGroup.Build

  const rebuildApp = createTask(
    TaskMode.rebuild,
    'Rebuild',
    'Rebuild the application',
    'flatpak',
    rebuildAppCommand,
    cmdEnv
  )
  rebuildApp.group = vscode.TaskGroup.Build

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
    cmdEnv
  )

  const exportBundle = new vscode.Task(
    {
      type: 'flatpak',
      mode: TaskMode.export,
    },
    vscode.TaskScope.Workspace,
    'Build the application and export it as a bundle',
    'Export bundle',
    new vscode.ShellExecution('print "hey"')
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

export async function getTask(mode: TaskMode): Promise<vscode.Task> {
  const tasks = await vscode.tasks.fetchTasks({ type: 'flatpak' })
  const filtered = tasks.filter((t) => t.definition.mode === mode)
  if (filtered.length === 0) {
    throw new Error(`Cannot find ${mode} task`)
  }
  return filtered[0]
}
