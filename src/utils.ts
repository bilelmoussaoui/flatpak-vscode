import * as dbus from 'dbus-next'
import { promises as fs, constants as fsc } from 'fs'
import { commands } from 'vscode'

export const ensureDocumentsPortal = async (): Promise<void> => {
  try {
    const bus = dbus.sessionBus()
    const obj = await bus.getProxyObject('org.freedesktop.portal.Documents', '/org/freedesktop/portal/documents')
    const portal = obj.getInterface('org.freedesktop.portal.Documents')
    await portal.GetMountPoint()
  } catch (err) {
    console.warn(`Failed to ensure documents portal: ${err as string}`)
  }
}

export const setContext = (ctx: string, state: boolean | string): void => {
  commands.executeCommand('setContext', ctx, state).then(
    () => { }, // eslint-disable-line @typescript-eslint/no-empty-function
    () => { } // eslint-disable-line @typescript-eslint/no-empty-function
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

export const generatePathOverride = (oldValue: string, prependValues: (string | undefined)[], appendValues: (string | undefined)[]): string => {
  let output = oldValue || ''
  for (const path of prependValues) {
    if (path) {
      output = `${path}:${output}`
    }
  }
  for (const path of appendValues) {
    if (path) {
      output = `${output}:${path}`
    }
  }
  return output
}
