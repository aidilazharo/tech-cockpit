import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { AppShell } from '../app-shell/AppShell'
import { useAuthStore } from './auth-store'
import { LoadingScreen, NoAccessScreen, UnavailableScreen } from './StatusScreens'

/** Every page except /signin and /design-system: needs a session. */
export function ProtectedLayout() {
  const location = useLocation()
  const status = useAuthStore((state) => state.status)
  const me = useAuthStore((state) => state.me)
  const notice = useAuthStore((state) => state.notice)

  useEffect(() => {
    useAuthStore.getState().ensureLoaded()
  }, [])

  if (status === 'signed-in' && me) {
    // No role in force today (never given, ended, or not started yet): nothing to show but the way out.
    if (me.roles.length === 0) return <NoAccessScreen me={me} />
    return (
      <AppShell me={me}>
        <Outlet context={me} />
      </AppShell>
    )
  }
  if (status === 'signed-out') {
    // After an explicit sign-out, start fresh; otherwise come back to this page.
    const here = `${location.pathname}${location.search}${location.hash}`
    const to = notice === 'signed_out' || here === '/' ? '/signin' : `/signin?returnTo=${encodeURIComponent(here)}`
    return <Navigate to={to} replace />
  }
  if (status === 'unavailable') {
    return <UnavailableScreen />
  }
  return <LoadingScreen />
}
