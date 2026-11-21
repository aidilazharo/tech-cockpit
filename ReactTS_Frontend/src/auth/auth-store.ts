import { create } from 'zustand'
import { api, ApiError, onSessionEnded, setAccessExpiry } from '../lib/api'

export interface Me {
  user: { id: string; username: string; email: string; firstName: string; lastName: string; isExternal: boolean }
  roles: string[]
  permissions: string[]
  isSystemAdmin: boolean
  authMethod: 'api-key' | 'session'
  session: { accessExpiresAt: string; expiresAt: string } | null
}

/** First and last name, or the Okta username when no name has been entered. */
export function displayName(user: Me['user']): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.username
}

/** Why the sign-in page is shown; the backend sends the error codes as /signin?error=<code>. */
export const SIGN_IN_NOTICES = [
  'signed_out',
  'session_ended',
  'sso_unavailable',
  'sign_in_failed',
  'sign_in_expired',
  'account_disabled',
  'not_registered',
] as const
export type SignInNotice = (typeof SIGN_IN_NOTICES)[number]

export function asSignInNotice(value: string | null): SignInNotice | null {
  return SIGN_IN_NOTICES.find((notice) => notice === value) ?? null
}

/** idle: not asked yet. unavailable: the API could not be reached. */
export type AuthStatus = 'idle' | 'loading' | 'signed-in' | 'signed-out' | 'unavailable'

interface AuthState {
  status: AuthStatus
  me: Me | null
  /** Set by this app (sign-out, session end); the sign-in page shows it. */
  notice: SignInNotice | null
  signOutFailed: boolean
  load: () => Promise<void>
  /** Loads the session unless it is already known or loading. */
  ensureLoaded: () => void
  signOut: () => Promise<void>
  /** The API could not renew the session (idle or absolute timeout, revoked). */
  sessionEnded: () => void
}

/** Backend URL that starts Okta sign-in; the backend re-checks returnTo. */
export function signInUrl(returnTo: string): string {
  return `/api/v1/auth/saml/login?returnTo=${encodeURIComponent(returnTo)}`
}

/** Full-page navigation (replaceable in tests: jsdom cannot navigate). */
export const navigation = {
  assign: (url: string) => window.location.assign(url),
}

export function signIn(returnTo: string): void {
  navigation.assign(signInUrl(returnTo))
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'idle',
  me: null,
  notice: null,
  signOutFailed: false,

  async load() {
    set({ status: 'loading' })
    try {
      const me = await api<Me>('/api/v1/me')
      setAccessExpiry(me.session?.accessExpiresAt ?? null)
      set({ status: 'signed-in', me, notice: null })
    } catch (error) {
      set({ status: error instanceof ApiError && error.status === 401 ? 'signed-out' : 'unavailable', me: null })
    }
  },

  ensureLoaded() {
    if (get().status === 'idle') {
      void get().load()
    }
  },

  async signOut() {
    try {
      await api('/api/v1/auth/logout', { method: 'POST' })
    } catch {
      // Stay signed in rather than pretend: the session cookie would still be valid.
      set({ signOutFailed: true })
      return
    }
    setAccessExpiry(null)
    set({ status: 'signed-out', me: null, notice: 'signed_out', signOutFailed: false })
  },

  sessionEnded() {
    if (get().status === 'signed-in') {
      setAccessExpiry(null)
      set({ status: 'signed-out', me: null, notice: 'session_ended' })
    }
  },
}))

onSessionEnded(() => useAuthStore.getState().sessionEnded())
