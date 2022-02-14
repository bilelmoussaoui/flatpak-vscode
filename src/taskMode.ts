import { EXT_ID } from './extension'
import { Status } from './statusBarItem'

export enum TaskMode {
    buildInit = 'build-init',
    updateDeps = 'update-deps',
    buildDeps = 'build-deps',
    buildApp = 'build-app',
    rebuild = 'rebuild',
    run = 'run',
    export = 'export',
    clean = 'clean',
}

export const taskModeAsStatus = (taskMode: TaskMode): Status => {
    let title
    switch (taskMode) {
        case TaskMode.buildInit:
            title = 'Initializing build environment'
            break
        case TaskMode.updateDeps:
            title = 'Updating application dependencies'
            break
        case TaskMode.buildDeps:
            title = 'Building application dependencies'
            break
        case TaskMode.buildApp:
            title = 'Building application'
            break
        case TaskMode.rebuild:
            title = 'Rebuilding application'
            break
        case TaskMode.run:
            title = 'Running application'
            break
        case TaskMode.export:
            title = 'Exporting bundle'
            break
        case TaskMode.clean:
            title = 'Cleaning build environment'
            break
    }

    return {
        title,
        type: 'ok',
        quiescent: true,
        clickable: {
            command: `${EXT_ID}.show-output-terminal`,
            tooltip: 'Show output'
        },
    }
}
