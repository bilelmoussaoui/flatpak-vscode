import * as dbus from 'dbus-next'
import { promises as fs, constants as fsc, PathLike } from 'fs'
import * as vscode from 'vscode'
import * as path from 'path'
import { homedir } from 'os'
import { IS_SANDBOXED } from './extension'
import { Command } from './command'

/**
 * Make sures the documents portal is running
 */
export async function ensureDocumentsPortal(): Promise<void> {
    try {
        const bus = dbus.sessionBus()
        const obj = await bus.getProxyObject('org.freedesktop.portal.Documents', '/org/freedesktop/portal/documents')
        const portal = obj.getInterface('org.freedesktop.portal.Documents')
        await portal.GetMountPoint()
    } catch (err) {
        console.warn(`Failed to ensure documents portal: ${err as string}`)
    }
}

export async function exists(path: PathLike): Promise<boolean> {
    try {
        await fs.access(path, fsc.F_OK)
        return true
    } catch {
        return false
    }
}

export function getHostEnv(): Map<string, string> {
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

export function generatePathOverride(oldValue: string, prependValues: (PathLike | undefined)[], appendValues: (PathLike | undefined)[]): string {
    return [...prependValues, oldValue, ...appendValues]
        .filter((path) => !!path)  // Filters out empty strings and undefined
        .join(':')
}

export async function appendWatcherExclude(paths: PathLike[]) {
    const config = vscode.workspace.getConfiguration('files')
    const value: Record<string, boolean> = config.get('watcherExclude') || {}

    for (const path of paths) {
        value[path.toString()] = true
    }

    await config.update('watcherExclude', value)
}

/**
 * Attempts to show the data directory of the app, typically in a file explorer.
 * @param appId The app id of the app
 */
export function showDataDirectory(appId: string) {
    const dataDirectory = path.join(homedir(), '.var/app/', appId)
    console.log(`Showing data directory at: ${dataDirectory}`)

    if (IS_SANDBOXED) {
        // Spawn in host since a Flatpak-ed app cannot access other Flatpak apps
        // data directory and would just fail silently if VSCode API's openExternal is used.
        new Command('xdg-open', [dataDirectory]).exec()
    } else {
        void vscode.env.openExternal(vscode.Uri.file(dataDirectory))
    }
}
