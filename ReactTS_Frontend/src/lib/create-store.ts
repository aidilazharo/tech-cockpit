import { useSyncExternalStore } from 'react'

type Update<T> = Partial<T> | ((state: T) => Partial<T>)
type Setter<T> = (update: Update<T>) => void

/** Small React-native external store for shared UI state. */
export function createStore<T>(initialize: (set: Setter<T>, get: () => T) => T) {
  const listeners = new Set<() => void>()
  let state: T
  const getState = () => state
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const setState: Setter<T> = (update) => {
    const patch = typeof update === 'function' ? update(state) : update
    if (Object.keys(patch).every((key) => Object.is(state[key as keyof T], patch[key as keyof T]))) return
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }
  state = initialize(setState, getState)

  function useStore<S>(selector: (state: T) => S): S {
    const snapshot = useSyncExternalStore(subscribe, getState, getState)
    return selector(snapshot)
  }
  return Object.assign(useStore, { getState, setState, subscribe })
}
