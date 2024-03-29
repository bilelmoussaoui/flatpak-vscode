import { Command } from './command'

export interface FlatpakEntry {
    id: string
    version: string
}

/**
 * Retrieves the list of installed flatpak applications or runtimes.
 * @param type applications or runtimes
 */
export function getAvailable(type: 'app' | 'runtime'): FlatpakEntry[] {
    const command = new Command('flatpak', ['list', `--${type}`, '--columns=application,branch'])
    const result = command.execSync().toString()

    const runtimes = []
    for (const line of result.split(/\r?\n/)) {  // Split at new line
        const [id, version] = line.split(/\s+/)  // Split at whitespace

        if (id && version) {
            runtimes.push({ id, version })
        }
    }

    return runtimes
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
