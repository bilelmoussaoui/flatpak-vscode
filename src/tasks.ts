import { Task, TaskProvider, tasks, ProviderResult } from 'vscode'
import { createTask } from './utils'
import { FlatpakManifest } from './terminal'

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

export const getTasks = (manifest: FlatpakManifest): Task[] => {
  return [
    createTask(TaskMode.buildInit, 'Initialize', [manifest.initBuild()]),
    createTask(TaskMode.updateDeps, 'Update Dependencies', [
      manifest.updateDependencies(),
    ]),
    createTask(TaskMode.buildDeps, 'Build Dependencies', [
      manifest.buildDependencies(),
    ]),
    createTask(TaskMode.buildApp, 'Build', manifest.build(false)),
    createTask(TaskMode.rebuild, 'Rebuild', manifest.build(true)),
    createTask(TaskMode.run, 'Run', [manifest.run()]),
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

  constructor(manifest: FlatpakManifest) {
    this.manifest = manifest
  }

  provideTasks(): ProviderResult<Task[]> {
    return getTasks(this.manifest)
  }

  resolveTask(): ProviderResult<Task> {
    return undefined
  }
}
