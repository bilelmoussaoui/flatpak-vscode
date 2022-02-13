import * as vscode from 'vscode'

const pty = getCoreNodeModule('node-pty') as typeof import('node-pty');

export type IPty = import('node-pty').IPty
export const spawn: typeof import('node-pty').spawn = pty.spawn;

function getCoreNodeModule(moduleName: string) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return require(`${vscode.env.appRoot}/node_modules.asar/${moduleName}`);
        // eslint-disable-next-line no-empty
    } catch (err) { }

    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return require(`${vscode.env.appRoot}/node_modules/${moduleName}`);
        // eslint-disable-next-line no-empty
    } catch (err) { }

    return null;
}
