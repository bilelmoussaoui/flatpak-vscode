import { promises as fs, constants as fsc } from 'fs'
import * as path from 'path'
import {
  Task,
  TaskScope,
  commands,
  tasks,
  window,
  workspace,
  Uri,
  TaskPanelKind,
  CustomExecution,
  Pseudoterminal,
} from 'vscode'
import * as yaml from 'js-yaml'
import { FlatpakManifestSchema } from './flatpak.types'
import { getTask, TaskMode } from './tasks'
import { Command, FlatpakManifest, FlatpakTaskTerminal } from './terminal'

export const isFlatpak = (manifest: FlatpakManifestSchema | null): boolean => {
  if (!manifest) {
    return false
  }
  const hasId = (manifest.id || manifest['app-id']) !== undefined
  const hasModules = manifest.modules !== undefined
  return hasId && hasModules
}

export const parseManifest = async (
  uri: Uri,
  isSandboxed: boolean
): Promise<FlatpakManifest | null> => {
  const data = (await fs.readFile(uri.fsPath)).toString()
  let manifest = null

  switch (path.extname(uri.fsPath)) {
    case '.json':
      manifest = JSON.parse(data) as FlatpakManifestSchema
      break
    case '.yml':
    case '.yaml':
      manifest = yaml.safeLoad(data) as FlatpakManifestSchema
      break
    default:
      window
        .showErrorMessage(
          'Failed to parse the manifest, please use a valid extension.'
        )
        .then(
          () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
          () => {} // eslint-disable-line @typescript-eslint/no-empty-function
        )
      break
  }
  if (isFlatpak(manifest)) {
    return new FlatpakManifest(
      uri,
      manifest as FlatpakManifestSchema,
      isSandboxed
    )
  }
  return null
}

export const findManifest = async (
  isSandboxed: boolean
): Promise<FlatpakManifest[]> => {
  const uris: Uri[] = await workspace.findFiles(
    '**/*.{json,yaml,yml}',
    '**/{target,.vscode,.flatpak-builder,flatpak_app,.flatpak}/*',
    1000
  )
  const manifests = []
  for (const uri of uris) {
    try {
      const manifest = await parseManifest(uri, isSandboxed)
      if (manifest) {
        manifests.push(manifest)
      }
    } catch (err) {
      console.warn(`Failed to parse the JSON file at ${uri.fsPath}`)
    }
  }
  return manifests
}

export const createTask = (
  mode: TaskMode,
  name: string,
  commands: Command[]
): Task => {
  const task = new Task(
    {
      type: 'flatpak',
      mode,
    },
    TaskScope.Workspace,
    name,
    'Flatpak',
    new CustomExecution(
      (): Thenable<Pseudoterminal> => {
        return Promise.resolve(new FlatpakTaskTerminal(commands))
      }
    )
  )
  task.presentationOptions.panel = TaskPanelKind.Shared
  task.presentationOptions.showReuseMessage = false
  task.group = 'flatpak'
  return task
}

export const execTask = async (
  mode: TaskMode,
  message: string | null
): Promise<void> => {
  if (message) {
    window.showInformationMessage(message).then(
      () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      () => {} // eslint-disable-line @typescript-eslint/no-empty-function
    )
  }
  const task = await getTask(mode)
  await tasks.executeTask(task)
}

export const setContext = (ctx: string, state: boolean | string): void => {
  commands.executeCommand('setContext', ctx, state).then(
    () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    () => {} // eslint-disable-line @typescript-eslint/no-empty-function
  )
}

export const exists = async (path: string): Promise<boolean> => {
  try {
    await fs.access(path, fsc.F_OK)
    return true
  } catch {
    return false
  }
}
