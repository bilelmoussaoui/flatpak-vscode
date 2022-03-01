import { execSync } from "child_process"
import { Command } from "./command"

let FLATPAK_VERSION_CACHE: string | undefined

/**
 * Gets the version of currently installed Flatpak in host
 * @returns Flatpak version in host
 */
export function getFlatpakVersion(): string {
    if (FLATPAK_VERSION_CACHE === undefined) {
        const command = new Command('flatpak', ['--version'])
        FLATPAK_VERSION_CACHE = execSync(command.toString())
            .toString()
            .replace('Flatpak', '')
            .trim()
        console.log(`Flatpak version: '${FLATPAK_VERSION_CACHE}'`)
    }

    return FLATPAK_VERSION_CACHE
}

/**
 * Check if version1 is newer or equal than version2
 * @param version1 a flatpak version, usually returned by flatpak --version
 * @param version2 a flatpak version, required by the manifest
 * @returns Whether version1 is newer or equal than version2
 */
export function versionCompare(version1: string, version2: string): boolean {
    // Ideally, this should maybe be a more sophisticated check
    return version1 >= version2
}
