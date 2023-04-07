// See also:
// https://github.com/microsoft/vscode/issues/84439
// https://code.visualstudio.com/api/advanced-topics/remote-extensions#persisting-secrets
// TODO: Replace with more reliable way to import node-pty

import * as vscode from 'vscode'

declare const WEBPACK_REQUIRE: typeof require
declare const NON_WEBPACK_REQUIRE: typeof require

const pty = getCoreNodeModule('node-pty') as typeof import('node-pty')

export type IPty = import('node-pty').IPty
export const spawn: typeof import('node-pty').spawn = pty.spawn

/**
 * Returns a node module installed with VSCode, or null if it fails.
 */
function getCoreNodeModule(moduleName: string) {
    const r = typeof WEBPACK_REQUIRE === 'function' ? NON_WEBPACK_REQUIRE : require
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return r(`${vscode.env.appRoot}/node_modules.asar/${moduleName}`)
    } catch (err) {
        console.error(`Failed to getCoreNodeModule '${moduleName}': ${err as string}`)
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return r(`${vscode.env.appRoot}/node_modules/${moduleName}`)
    } catch (err) {
        console.error(`Failed to getCoreNodeModule '${moduleName}': ${err as string}`)
    }

    return null
}
