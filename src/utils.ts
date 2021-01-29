import { promises as fs, constants as fsc } from 'fs'
import * as path from 'path'
import { commands, window, workspace, Uri } from 'vscode'
import * as yaml from 'js-yaml'
import { FlatpakManifestSchema } from './flatpak.types'
import { FlatpakManifest } from './terminal'

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

export const findManifests = async (
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
      console.warn(`Failed to parse the manifest at ${uri.fsPath}`)
    }
  }
  return manifests
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

export const getHostEnv = (): Map<string, string> => {
  const forwardedEnvKeys: string[] = [
    'COLORTERM',
    'DESKTOP_SESSION',
    'LANG',
    'WAYLAND_DISPLAY',
    'XDG_CURRENT_DESKTOP',
    'XDG_SEAT',
    'XDG_SESSION_DESKTOP',
    'XDG_SESSION_ID',
    'XDG_SESSION_TYPE',
    'XDG_VTNR',
    'AT_SPI_BUS_ADDRESS',
  ]

  const envVars = new Map<string, string>()

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && forwardedEnvKeys.includes(key)) {
      envVars.set(key, value)
    }
  }
  return envVars
}
