import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as yaml from 'js-yaml'
import { FlatpakManifest } from './flatpak.types'
import { getTask } from './tasks'

export const isFlatpak = (manifest: FlatpakManifest | null): boolean => {
  if (!manifest) {
    return false
  }
  const hasId = (manifest.id || manifest['app-id']) !== undefined
  const hasModules = manifest.modules !== undefined
  return hasId && hasModules
}

export const parseManifest = async (
  uri: vscode.Uri
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
      await vscode.window.showErrorMessage(
        'Failed to parse the manifest, please use a valid extension.'
      )
      break
  }

  if (isFlatpak(manifest)) {
    return manifest
  }
  return null
}

export const findManifest = async (): Promise<vscode.Uri | null> => {
  const uris: vscode.Uri[] = await vscode.workspace.findFiles(
    '**/*.{json,yaml,yml}',
    '**/{target,.vscode,.flatpak-builder,flatpak_app,.flatpak}/*',
    1000
  )

  for (const uri of uris) {
    try {
      const manifest = await parseManifest(uri)
      if (manifest) {
        return uri
      }
    } catch (err) {
      console.warn(`Failed to parse the JSON file at ${uri.fsPath}`)
    }
  }
  return null
}

export const createTask = (
  mode: string,
  name: string,
  description: string,
  cmd: string,
  args: string[][],
  env: vscode.ShellExecutionOptions
): vscode.Task => {
  const command = args.map((arg) => [cmd, ...arg].join(' ')).join(' && ')
  const task = new vscode.Task(
    {
      type: 'flatpak',
      mode,
    },
    vscode.TaskScope.Workspace,
    name,
    description,
    new vscode.ShellExecution(command, env)
  )
  return task
}

export const execTask = async (
  mode: string,
  message: string | null
): Promise<void> => {
  if (message) {
    await vscode.window.showInformationMessage(message)
  }
  const task = await getTask(mode)
  await vscode.tasks.executeTask(task)
}
