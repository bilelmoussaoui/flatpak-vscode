import * as fs from 'fs'
import * as path from 'path'
import {
  Task,
  TaskScope,
  ShellExecution,
  tasks,
  window,
  workspace,
  Uri,
} from 'vscode'
import * as yaml from 'js-yaml'
import { FlatpakManifest } from './flatpak.types'
import { getTask, TaskMode } from './tasks'

export const isFlatpak = (manifest: FlatpakManifest | null): boolean => {
  if (!manifest) {
    return false
  }
  const hasId = (manifest.id || manifest['app-id']) !== undefined
  const hasModules = manifest.modules !== undefined
  return hasId && hasModules
}

export const parseManifest = async (
  uri: Uri
): Promise<FlatpakManifest | null> => {
  const data = (await fs.promises.readFile(uri.fsPath)).toString()
  let manifest = null

  switch (path.extname(uri.fsPath)) {
    case '.json':
      manifest = JSON.parse(data) as FlatpakManifest
      break
    case '.yml':
    case '.yaml':
      manifest = yaml.safeLoad(data) as FlatpakManifest
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
    return manifest
  }
  return null
}

export const findManifest = async (): Promise<
  [Uri, FlatpakManifest] | [null, null]
> => {
  const uris: Uri[] = await workspace.findFiles(
    '**/*.{json,yaml,yml}',
    '**/{target,.vscode,.flatpak-builder,flatpak_app,.flatpak}/*',
    1000
  )

  for (const uri of uris) {
    try {
      const manifest = await parseManifest(uri)
      if (manifest) {
        return [uri, manifest]
      }
    } catch (err) {
      console.warn(`Failed to parse the JSON file at ${uri.fsPath}`)
    }
  }
  return [null, null]
}

export const createTask = (
  mode: string,
  name: string,
  description: string,
  cmd: string,
  args: string[][],
  cwd: string
): Task => {
  const command = args.map((arg) => [cmd, ...arg].join(' ')).join(' && ')
  const task = new Task(
    {
      type: 'flatpak',
      mode,
    },
    TaskScope.Workspace,
    name,
    description,
    new ShellExecution(command, {
      cwd,
    })
  )
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

export const getBuildDir = (workspace: string): string => {
  return path.join(workspace, '.flatpak')
}

export const getWorkspacePath = (manifest: Uri): string => {
  return workspace.getWorkspaceFolder(manifest)?.uri.fsPath || ''
}
