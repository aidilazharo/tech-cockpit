import { useEffect } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { safePath } from '../lib/safe-path'
import { asSignInNotice, useAuthStore } from './auth-store'
import { SignInPage } from './SignInPage'
import { LoadingScreen, UnavailableScreen } from './StatusScreens'

/** /signin?returnTo=<path>&error=<code>. Signed-in users go straight to returnTo. */
export function SignInRoute() {
  const [params] = useSearchParams()
  const status = useAuthStore((state) => state.status)
  const notice = useAuthStore((state) => state.notice)
  const returnTo = safePath(params.get('returnTo')) ?? '/'

  useEffect(() => {
    useAuthStore.getState().ensureLoaded()
  }, [])

  if (status === 'signed-in') {
    return <Navigate to={returnTo} replace />
  }
  if (status === 'signed-out') {
    return <SignInPage notice={notice ?? asSignInNotice(params.get('error'))} returnTo={returnTo} />
  }
  if (status === 'unavailable') {
    return <UnavailableScreen />
  }
  return <LoadingScreen />
}
