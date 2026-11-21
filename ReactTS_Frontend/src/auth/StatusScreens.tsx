import { useTranslation } from 'react-i18next'
import { Brand } from '../app-shell/Brand'
import { Button, PageMessage } from '../components/qi'
import { displayName, useAuthStore, type Me } from './auth-store'

export function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-default text-text-subdued">
      <p role="status">{t('common.loading')}</p>
    </main>
  )
}

export function UnavailableScreen() {
  const { t } = useTranslation()
  const load = useAuthStore((state) => state.load)
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-surface-default px-4 text-text-default">
      <h1 className="sr-only">{t('app.name')}</h1>
      <PageMessage
        variant="error"
        title={t('auth.unavailable.title')}
        action={<Button onClick={() => void load()}>{t('common.retry')}</Button>}
      >
        {t('auth.unavailable.body')}
      </PageMessage>
    </main>
  )
}

/** Signed in, but without a role in force: no navigation, only how to get access and Sign out. */
export function NoAccessScreen({ me }: { me: Me }) {
  const { t } = useTranslation()
  const signOut = useAuthStore((state) => state.signOut)
  return (
    <div className="flex min-h-dvh flex-col bg-surface-alternate text-text-default">
      <header className="border-b border-divider-default bg-surface-default px-4 py-4 md:px-8">
        <Brand />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-card border border-divider-default bg-surface-default p-6 md:p-8">
          <h1 className="heading-2">{t('noAccess.title')}</h1>
          <p>{t('noAccess.body')}</p>
          <p className="text-text-subdued">{t('noAccess.signedInAs', { name: displayName(me.user), username: me.user.username })}</p>
          <Button variant="secondary" className="w-fit" onClick={() => void signOut()}>
            {t('auth.signOut')}
          </Button>
        </div>
      </main>
    </div>
  )
}
