import * as path from 'path'
import {
  Task,
  Uri,
  TaskProvider,
  tasks,
  ProviderResult,
} from 'vscode'
import { getBuildDir, getWorkspacePath, createTask } from './utils'
import { FlatpakManifest } from './flatpak.types'
import { getBuildAppCommand, buildInit, buildDependencies, run, updateDependencies } from './commands'

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

export const getTasks = (manifest: FlatpakManifest, uri: Uri): Task[] => {
  const manifestPath = uri.fsPath
  const lastModule = manifest.modules.slice(-1)[0]
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
  return [
    createTask(TaskMode.buildInit, 'init', [buildInit (manifest, buildDir, workspacePath)]),
    createTask(TaskMode.updateDeps, 'Update dependencies', [updateDependencies (manifestPath, buildDir, workspacePath, stateDir, lastModule.name)]),
    createTask(TaskMode.buildDeps, 'Build dependencies', [buildDependencies (manifestPath, buildDir, workspacePath, stateDir, lastModule.name )]),
    createTask(TaskMode.buildApp, 'Build application', buildAppCommand),
    createTask(TaskMode.rebuild, 'Rebuild application', rebuildAppCommand),
    createTask(TaskMode.run, 'run', [run(manifest, buildDir, workspacePath)]),
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

