import { useTranslation } from 'react-i18next'
import { Button, PageMessage, type PageMessageVariant } from '../components/qi'
import { Brand } from '../app-shell/Brand'
import { signIn, type SignInNotice } from './auth-store'
import { useRefusedUsername } from './refused-username'

const NOTICE_VARIANT: Record<SignInNotice, PageMessageVariant> = {
  signed_out: 'informative',
  session_ended: 'warning',
  sso_unavailable: 'error',
  sign_in_failed: 'error',
  sign_in_expired: 'warning',
  account_disabled: 'error',
  not_registered: 'error',
}

/** Shown whenever there is no session. Signing in always goes through Okta. */
export function SignInPage({ notice, returnTo }: { notice: SignInNotice | null; returnTo: string }) {
  const { t } = useTranslation()
  const refused = useRefusedUsername(notice === 'not_registered')
  const username = refused.data?.username

  return (
    <div className="flex min-h-dvh flex-col bg-surface-alternate text-text-default">
      <header className="border-b border-divider-default bg-surface-default px-4 py-4 md:px-8">
        <Brand />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-card border border-divider-default bg-surface-default p-6 md:p-8">
          <h1 className="heading-2">{t('auth.signInTitle')}</h1>
          {notice && (
            <PageMessage variant={NOTICE_VARIANT[notice]} title={t(`auth.notice.${notice}.title`)}>
              {t(`auth.notice.${notice}.body`)}
              {username && <span className="mt-2 block font-semibold">{t('auth.notice.not_registered.username', { username })}</span>}
            </PageMessage>
          )}
          <p className="text-text-subdued">{t('auth.signInIntro')}</p>
          <Button size="lg" onClick={() => signIn(returnTo)}>
            {t('auth.signInButton')}
          </Button>
        </div>
      </main>
    </div>
  )
}
