import { createStore, createEvent } from 'effector'
import { promises as fs } from 'fs'

import { statusBarItem, EXT_ID } from './extension'
import { FlatpakManifest } from './flatpakManifest'
import { Command } from './command'
import { TaskMode, taskModeAsStatus } from './taskMode'
import { exists, setContext } from './utils'
import { loadRustAnalyzerConfigOverrides, restoreRustAnalyzerConfigOverrides } from './integration/rustAnalyzer'

import { commands, workspace } from 'vscode'
const { executeCommand } = commands

// Available settings keys
export enum Settings {
  extensionsIntegration = 'extensionsIntegration',
}

// Events
export const manifestFound = createEvent<FlatpakManifest>()
export const manifestSelected = createEvent<FlatpakManifest>()
export const manifestRemoved = createEvent<FlatpakManifest>()
export const initialize = createEvent()
export const clean = createEvent()
export const failure = createEvent<PayloadError>()
export const finished = createEvent<TaskFinished>()
export const newTask = createEvent<TaskMode>()

export const loadFrom = async (path: string): Promise<void> => {
  try {
    const data = (await fs.readFile(path)).toString()
    const latestState = JSON.parse(data) as State

    // re-add the latest found manifests
    latestState.manifests.forEach((m) => manifestFound(m))
    const pipeline = latestState.pipeline
    // Trigger finished task so we update the context
    if (pipeline.initialized) {
      finished({ mode: TaskMode.buildInit, restore: true, completeBuild: false })
    }
    if (pipeline.dependencies.updated) {
      finished({ mode: TaskMode.updateDeps, restore: true, completeBuild: false })
    }
    if (pipeline.dependencies.built) {
      finished({ mode: TaskMode.buildDeps, restore: true, completeBuild: false })
    }
    if (pipeline.application.built) {
      finished({ mode: TaskMode.buildApp, restore: true, completeBuild: false })
    }
  } catch (err) {
    state.getState().pipeline.initialized = false
    // Most likely we didn't find the pipeline backup
  }
}

export const dumpInto = async (path: string): Promise<void> => {
  const data = JSON.stringify(state.getState())
  await fs.writeFile(path, data)
}

// The extension state
export interface State {
  selectedManifest: FlatpakManifest | null
  manifests: FlatpakManifest[]
  pipeline: {
    latestStep: null | TaskMode
    initialized: boolean
    error: PayloadError | null
    dependencies: {
      updated: boolean
      built: boolean
    }
    application: {
      built: boolean
    }
  }
}

export interface TaskFinished {
  restore: boolean
  mode: TaskMode,
  completeBuild: boolean,
}

export const state = createStore<State>({
  selectedManifest: null,
  manifests: [],
  pipeline: {
    latestStep: null,
    error: null,
    initialized: false,
    dependencies: {
      updated: false,
      built: false,
    },
    application: {
      built: false,
    },
  },
})

// A typical error
export interface PayloadError {
  command: Command | null
  message: string | null
}

state
  .on(manifestFound, (state, manifest) => {
    setContext('flatpakManifestFound', true)
    state.manifests.push(manifest)
  })
  .on(manifestSelected, (state, manifest) => {
    state.selectedManifest = manifest
    exists(manifest.repoDir).then(
      (exists) => {
        if (exists) {
          initialize()
          // Reload the pipeline state from the on-disk save
          loadFrom(manifest.stateFile).then(
            () => { },// eslint-disable-line @typescript-eslint/no-empty-function
            () => { } // eslint-disable-line @typescript-eslint/no-empty-function
          )
        }
      },
      () => { } // eslint-disable-line @typescript-eslint/no-empty-function
    )
  })
  .on(initialize, (state) => {
    const manifest = state.selectedManifest
    // Automatically set stuff depending on the current SDK
    switch (manifest?.sdk()) {
      case 'rust':
        {
          if (workspace.getConfiguration(`${EXT_ID}`).get(Settings.extensionsIntegration)) {
            loadRustAnalyzerConfigOverrides(manifest)
              .then(() => { }, () => { }) // eslint-disable-line @typescript-eslint/no-empty-function
          } else {
            restoreRustAnalyzerConfigOverrides(manifest)
          }
        }
        break
    }
  })
  .on(newTask, (_state, taskMode) => {
    statusBarItem?.setStatus(taskModeAsStatus(taskMode))
  })
  .on(finished, (state, finishedTask) => {
    statusBarItem?.setStatus(null)

    switch (finishedTask.mode) {
      case TaskMode.buildInit:
        setContext('flatpakInitialized', true)
        state.pipeline.initialized = true
        initialize()
        if (!finishedTask.restore) {
          executeCommand(`${EXT_ID}.${TaskMode.updateDeps}`, finishedTask.completeBuild)
            .then(() => { }, () => { }) // eslint-disable-line @typescript-eslint/no-empty-function
        }
        break
      case TaskMode.updateDeps:
        state.pipeline.dependencies.updated = true
        state.pipeline.dependencies.built = false
        // Assume user might want to rebuild dependencies
        setContext('flatpakDependenciesBuilt', false)
        if (!finishedTask.restore) {
          executeCommand(`${EXT_ID}.${TaskMode.buildDeps}`, finishedTask.completeBuild)
            .then(() => { }, () => { }) // eslint-disable-line @typescript-eslint/no-empty-function

        }
        break
      case TaskMode.buildDeps:
        setContext('flatpakDependenciesBuilt', true)
        state.pipeline.dependencies.built = true
        if (!finishedTask.restore && finishedTask.completeBuild) {
          executeCommand(`${EXT_ID}.${TaskMode.buildApp}`)
            .then(() => { }, () => { }) // eslint-disable-line @typescript-eslint/no-empty-function

        }
        break
      case TaskMode.buildApp:
        setContext('flatpakApplicationBuilt', true)
        state.pipeline.application.built = true
        break
      case TaskMode.rebuild:
        setContext('flatpakApplicationBuilt', true)
        state.pipeline.application.built = true
        if (!finishedTask.restore) {
          executeCommand(`${EXT_ID}.${TaskMode.run}`)
            .then(() => { }, () => { }) // eslint-disable-line @typescript-eslint/no-empty-function
        }
        break
    }
    if (
      finishedTask.mode !== state.pipeline.latestStep &&
      !finishedTask.restore
    ) {
      // Re-dump the state of the pipeline whenever a task is over
      const stateFile = state.selectedManifest?.stateFile as string
      dumpInto(stateFile).then(
        () => { }, // eslint-disable-line @typescript-eslint/no-empty-function
        () => { } // eslint-disable-line @typescript-eslint/no-empty-function
      )
    }
    state.pipeline.latestStep = finishedTask.mode
  })
  .on(clean, (state) => {
    setContext('flatpakInitialized', false)
    setContext('flatpakDependenciesBuilt', false)
    setContext('flatpakApplicationBuilt', false)
    state.pipeline.initialized = false
    state.pipeline.latestStep = null
  })
  .on(failure, (state, payload: PayloadError) => {
    console.log(payload)

    let title = 'An error occurred'
    if (state.pipeline.latestStep !== null) {
      title = `Failed to run ${state.pipeline.latestStep}`
    }

    statusBarItem?.setStatus({
      type: 'error',
      quiescent: false,
      title,
      clickable: {
        command: `${EXT_ID}.show-output-channel`,
        tooltip: 'Show output'
      },
    })

    state.pipeline.error = payload
  })

export const currentStep = (): TaskMode | null => {
  return state.getState().pipeline.latestStep
}
