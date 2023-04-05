import * as dbus from 'dbus-next'
import { promises as fs, constants as fsc, PathLike } from 'fs'
import * as vscode from 'vscode'
import * as path from 'path'
import { homedir } from 'os'
import { env } from 'process'
import { IS_SANDBOXED } from './extension'
import { Command } from './command'
import { Lazy } from './lazy'
import { execFile } from 'child_process'

const HOME_DIR = new Lazy(() => {
    return homedir()
})
const SYSTEM_FONTS_DIR = '/usr/share/fonts'
const SYSTEM_LOCAL_FONT_DIR = '/usr/share/local/fonts'
const SYSTEM_FONT_CACHE_DIRS = [
    '/usr/lib/fontconfig/cache',
    '/var/cache/fontconfig',
]
const USER_CACHE_DIR = new Lazy(() => {
    if (IS_SANDBOXED.get()) {
        return path.join(HOME_DIR.get(), '.cache')
    } else {
        return env.XDG_CACHE_HOME || path.join(HOME_DIR.get(), '.cache')
    }
})
const USER_DATA_DIR = new Lazy(() => {
    if (IS_SANDBOXED.get()) {
        return path.join(HOME_DIR.get(), '.local/share')
    } else {
        return env.XDG_DATA_HOME || path.join(HOME_DIR.get(), '.local/share')
    }
})
const USER_FONTS = new Lazy(() => {
    return [
        path.join(USER_DATA_DIR.get(), 'fonts'),
        path.join(HOME_DIR.get(), '.fonts')
    ]
})
const USER_FONTS_CACHE_DIR = new Lazy(() => {
    return path.join(USER_CACHE_DIR.get(), 'fontconfig')
})

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
        await fs.access(path, fsc.R_OK)
        return true
    } catch {
        return false
    }
}

/**
 * Similar to exists but verifies that the path exists on the host.
 */
export async function existsOnHost(p: PathLike): Promise<boolean> {
    if (!IS_SANDBOXED.get()) {
        return await exists(p)
    } else {
        const local = path.join('/var/run/host', p as string)
        if (await exists(local)) {
            return true
        } else {
            try {
                execFile('ls', ['-d', p as string])
                return true
            } catch {
                return false
            }
        }
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
    const dataDirectory = path.join(HOME_DIR.get(), '.var/app/', appId)
    console.log(`Showing data directory at: ${dataDirectory}`)

    if (IS_SANDBOXED.get()) {
        // Spawn in host since a Flatpak-ed app cannot access other Flatpak apps
        // data directory and would just fail silently if VSCode API's openExternal is used.
        new Command('xdg-open', [dataDirectory]).exec()
    } else {
        void vscode.env.openExternal(vscode.Uri.file(dataDirectory))
    }
}

/**
 * Get bind mounts for the host fonts & their cache.
 */
export async function getFontsArgs(): Promise<string[]> {
    const args: string[] = []
    const mappedFontFile = path.join(USER_CACHE_DIR.get(), 'font-dirs.xml')
    let fontDirContent = '<?xml version="1.0"?>\n'
    fontDirContent += '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n'
    fontDirContent += '<fontconfig>\n'
    if (await existsOnHost(SYSTEM_FONTS_DIR)) {
        args.push(`--bind-mount=/run/host/fonts=${SYSTEM_FONTS_DIR}`)
        fontDirContent += `\t<remap-dir as-path="${SYSTEM_FONTS_DIR}">/run/host/fonts</remap-dir>\n`
    }
    if (await exists(SYSTEM_LOCAL_FONT_DIR)) {
        args.push(`--bind-mount=/run/host/local-fonts=${SYSTEM_LOCAL_FONT_DIR}`)
        fontDirContent += `\t<remap-dir as-path="${SYSTEM_LOCAL_FONT_DIR}">/run/host/local-fonts</remap-dir>\n`
    }
    for (const cache of SYSTEM_FONT_CACHE_DIRS) {
        if (await existsOnHost(cache)) {
            args.push(`--bind-mount=/run/host/fonts-cache=${cache}`)
            break
        }
    }
    for (const dir of USER_FONTS.get()) {
        if (await exists(dir)) {
            args.push(`--filesystem=${dir}:ro`)
            fontDirContent += `\t<remap-dir as-path="${dir}">/run/host/user-fonts</remap-dir>\n`
        }
    }
    if (await exists(USER_FONTS_CACHE_DIR.get())) {
        args.push(`--filesystem=${USER_FONTS_CACHE_DIR.get()}:ro`)
        args.push(`--bind-mount=/run/host/user-fonts-cache=${USER_FONTS_CACHE_DIR.get()}`)
    }
    fontDirContent += '</fontconfig>\n'
    args.push(`--bind-mount=/run/host/font-dirs.xml=${mappedFontFile}`)
    await fs.writeFile(mappedFontFile, fontDirContent)
    return args
}
