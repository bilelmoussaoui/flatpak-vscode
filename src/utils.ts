import * as dbus from 'dbus-next'
import { promises as fs, constants as fsc, PathLike } from 'fs'

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
    let output = oldValue || ''
    for (const path of prependValues) {
        if (path) {
            output = `${path.toString()}:${output}`
        }
    }
    for (const path of appendValues) {
        if (path) {
            output = `${output}:${path.toString()}`
        }
    }
    return output
}
