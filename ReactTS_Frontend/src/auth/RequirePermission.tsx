import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PageMessage } from '../components/qi'
import { useCan } from './permissions'

/** Shows the page only to users holding the permission, or any one of several (the API checks again). */
export function RequirePermission({ permission, children }: { permission: string | string[]; children: ReactNode }) {
  const { t } = useTranslation()
  const can = useCan()
  if ((Array.isArray(permission) ? permission : [permission]).some(can)) return children
  return (
    <>
      <h1 className="heading-1">{t('forbidden.title')}</h1>
      <PageMessage variant="warning" title={t('forbidden.title')}>
        {t('forbidden.body')}
      </PageMessage>
    </>
  )
}
