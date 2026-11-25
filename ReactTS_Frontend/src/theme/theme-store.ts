import { createStore } from '../lib/create-store'

interface StorageAdapter {
  getItem: (name: string) => string | null
  setItem: (name: string, value: string) => void
  removeItem: (name: string) => void
}

export type ThemePreference = 'system' | 'light' | 'dark'

interface ThemeState {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

/** localStorage that never throws (blocked storage, private browsing). UI preference only. */
export const safeLocalStorage: StorageAdapter = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // Preference simply isn't remembered.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // Nothing to remove.
    }
  },
}

const storageKey = 'tc-theme'

function readPreference(): ThemePreference {
  try {
    const stored = safeLocalStorage.getItem(storageKey)
    const value: unknown = stored ? JSON.parse(stored).state?.preference : null
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export const useThemeStore = createStore<ThemeState>((set) => ({
  preference: readPreference(),
  setPreference: (preference) => set({ preference }),
}))

// Keep the previous persisted format so existing user preferences survive.
useThemeStore.subscribe(() => {
  safeLocalStorage.setItem(storageKey, JSON.stringify({
    state: { preference: useThemeStore.getState().preference },
    version: 0,
  }))
})

/** "system" removes the attribute so the prefers-color-scheme media query decides. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', preference)
  }
}
