import { createStore, createEvent } from 'effector'
import { promises as fs } from 'fs'

import { Command, FlatpakManifest, TaskMode } from './terminal'
import { exists, setContext } from './utils'

// Events
export const manifestFound = createEvent<FlatpakManifest>()
export const manifestSelected = createEvent<FlatpakManifest>()
export const manifestRemoved = createEvent<FlatpakManifest>()
export const initialize = createEvent()
export const clean = createEvent()
export const failure = createEvent<PayloadError>()
export const finished = createEvent<TaskFinished>()

export const loadFrom = async (path: string): Promise<void> => {
  try {
    const data = (await fs.readFile(path)).toString()
    const latestState = JSON.parse(data) as State

    // re-add the latest found manifests
    latestState.manifests.forEach((m) => manifestFound(m))
    const pipeline = latestState.pipeline
    // Trigger finished task so we update the context
    if (pipeline.initialized) {
      finished({ mode: TaskMode.buildInit, restore: true })
    }
    if (pipeline.dependencies.updated) {
      finished({ mode: TaskMode.updateDeps, restore: true })
    }
    if (pipeline.dependencies.built) {
      finished({ mode: TaskMode.buildDeps, restore: true })
    }
    if (pipeline.application.built) {
      finished({ mode: TaskMode.buildApp, restore: true })
    }
  } catch (err) {
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
  restore: boolean,
  mode: TaskMode,
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
          loadFrom(manifest.stateFile).then(() => { }, () => { }) // eslint-disable-line @typescript-eslint/no-empty-function
        }
      },
      () => { } // eslint-disable-line @typescript-eslint/no-empty-function
    )
    // Automatically set stuff depending on the current SDK
    switch (manifest.sdk()) {
      case 'rust':
        {
          manifest
            .overrideWorkspaceConfig(
              'rust-analyzer',
              'server.path',
              'rust-analyzer'
            )
            .then(
              () => { }, // eslint-disable-line @typescript-eslint/no-empty-function
              () => { } // eslint-disable-line @typescript-eslint/no-empty-function
            )
        }
        break
    }
  })
  .on(finished, (state, finishedTask) => {
    switch (finishedTask.mode) {
      case TaskMode.buildInit:
        setContext('flatpakInitialized', true)
        state.pipeline.initialized = true
        break
      case TaskMode.updateDeps:
        state.pipeline.dependencies.updated = true
        // Assume user might want to rebuild dependencies
        setContext('flatpakDependenciesBuilt', false)
        break
      case TaskMode.buildDeps:
        setContext('flatpakDependenciesBuilt', true)
        state.pipeline.dependencies.built = true
        break
      case TaskMode.buildApp:
        setContext('flatpakApplicationBuilt', true)
        state.pipeline.application.built = true
        break
    }
    if (finishedTask.mode !== state.pipeline.latestStep && !finishedTask.restore) {
      // Re-dump the state of the pipeline whenever a task is over
      const stateFile = state.selectedManifest?.stateFile as string
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      dumpInto(stateFile).then(() => { }, () => { })
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
    state.pipeline.error = payload
  })

export const currentStep = (): TaskMode | null => {
  return state.getState().pipeline.latestStep
}
