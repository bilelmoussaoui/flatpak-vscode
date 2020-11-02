import { createStore, createEvent } from 'effector'
import { setContext } from './utils'

export const manifestFound = createEvent()
export const found = createStore(false).on(manifestFound, () => {
  setContext('flatpakManifestFound', true)
  return true
})

export const initialize = createEvent()
export const clean = createEvent()

export const initialized = createStore(false)
  .on(initialize, () => {
    setContext('flatpakInitialized', true)
    return true
  })
  .on(clean, () => {
    setContext('flatpakInitialized', false)
    setContext('flatpakDependenciesBuilt', false)
    setContext('flatpakApplicationBuilt', false)
    return false
  })

export const dependenciesUpdated = createEvent()
export const dependenciesBuilt = createEvent()

export const dependencies = createStore({ updated: false, built: false })
  .on(dependenciesUpdated, (state) => {
    state.updated = true
    // Assume user might want to rebuild dependencies
    setContext('flatpakDependenciesBuilt', false)
  })
  .on(dependenciesBuilt, (state) => {
    setContext('flatpakDependenciesBuilt', true)
    state.built = true
  })
  .on(clean, (state) => {
    state.updated = false
    state.built = false
  })

export const applicationBuilt = createEvent()

export const application = createStore({ built: false })
  .on(applicationBuilt, (state) => {
    setContext('flatpakApplicationBuilt', true)
    state.built = true
  })
  .on(clean, (state) => {
    setContext('flatpakApplicationBuilt', false)
    state.built = false
  })
