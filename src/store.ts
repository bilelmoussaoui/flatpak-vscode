import { createStore, createEvent } from 'effector'
import { Command, FlatpakManifest } from './terminal'
import { setContext } from './utils'
import { TaskMode } from './tasks'

// Events
export const manifestFound = createEvent<FlatpakManifest>()
export const manifestRemoved = createEvent<FlatpakManifest>()
export const initialize = createEvent()
export const clean = createEvent()
export const dependenciesUpdated = createEvent()
export const dependenciesBuilt = createEvent()
export const applicationBuilt = createEvent()
export const failure = createEvent<PayloadError>()

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
  })
  .on(initialize, (state) => {
    setContext('flatpakInitialized', true)
    state.pipeline.initialized = true
    state.pipeline.latestStep = TaskMode.buildInit
  })
  .on(clean, (state) => {
    setContext('flatpakInitialized', false)
    setContext('flatpakDependenciesBuilt', false)
    setContext('flatpakApplicationBuilt', false)
    state.pipeline.initialized = false
    state.pipeline.latestStep = null
  })
  .on(dependenciesUpdated, (state) => {
    state.pipeline.dependencies.updated = true
    // Assume user might want to rebuild dependencies
    setContext('flatpakDependenciesBuilt', false)
    state.pipeline.latestStep = TaskMode.updateDeps
  })
  .on(dependenciesBuilt, (state) => {
    setContext('flatpakDependenciesBuilt', true)
    state.pipeline.dependencies.built = true
    state.pipeline.latestStep = TaskMode.buildDeps
  })
  .on(applicationBuilt, (state) => {
    setContext('flatpakApplicationBuilt', true)
    state.pipeline.application.built = true
    state.pipeline.latestStep = TaskMode.buildApp
  })
  .on(failure, (state, payload: PayloadError) => {
    state.pipeline.error = payload
  })

export const currentStep = (): TaskMode | null => {
  return state.getState().pipeline.latestStep
}
