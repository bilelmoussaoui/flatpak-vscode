import { createStore, createEvent } from 'effector'
import { Command, FlatpakManifest } from './terminal'
import { exists, setContext } from './utils'
import { TaskMode } from './tasks'
import { Task } from 'vscode'

// Events
export const manifestFound = createEvent<FlatpakManifest>()
export const manifestRemoved = createEvent<FlatpakManifest>()
export const initialize = createEvent()
export const clean = createEvent()
export const dependenciesUpdated = createEvent()
export const dependenciesBuilt = createEvent()
export const applicationBuilt = createEvent()
export const failure = createEvent<PayloadError>()
export const finished = createEvent<TaskMode>()
// Triggered before running a task to remove the latest stored error
export const cleanup = createEvent()

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
    exists(manifest.repoDir).then(
      (exists) => {
        if (exists) {
          initialize()
        }
      },
      () => {} // eslint-disable-line @typescript-eslint/no-empty-function
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
              () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
              () => {} // eslint-disable-line @typescript-eslint/no-empty-function
            )
        }
        break
    }
  })
  .on(finished, (state, mode) => {
    console.log(mode)
    switch (mode) {
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
    state.pipeline.latestStep = mode
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
  .on(cleanup, (state) => {
    state.pipeline.error = null
  })

export const currentStep = (): TaskMode | null => {
  return state.getState().pipeline.latestStep
}
