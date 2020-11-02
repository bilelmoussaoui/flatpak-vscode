import { createStore, createEvent } from 'effector'

export const initialize = createEvent()
export const clean = createEvent()

export const initialized = createStore(false)
  .on(initialize, () => true)
  .on(clean, () => false)

export const dependenciesUpdated = createEvent()
export const dependenciesBuilt = createEvent()

export const dependencies = createStore({ updated: false, built: false })
  .on(dependenciesUpdated, (state) => {
    state.updated = true
  })
  .on(dependenciesBuilt, (state) => {
    state.built = true
  })
  .on(clean, (state) => {
    state.updated = false
    state.built = false
  })

export const applicationBuilt = createEvent()

export const application = createStore({ built: false })
  .on(applicationBuilt, (state) => {
    state.built = true
  })
  .on(clean, (state) => {
    state.built = false
  })
