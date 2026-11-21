import { useTranslation } from 'react-i18next'
import { Button, PageMessage } from '../qi'

/** Loading state for a data view. */
export function Loading() {
  const { t } = useTranslation()
  return (
    <p role="status" className="text-text-subdued">
      {t('common.loadingData')}
    </p>
  )
}

/** Error state with a retry (Qi page-level message, one action). */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <PageMessage
      variant="error"
      title={t('common.loadFailed.title')}
      action={<Button onClick={onRetry}>{t('common.retry')}</Button>}
    >
      {t('common.loadFailed.body')}
    </PageMessage>
  )
}

/** A failed save or action, with the API's explanation. */
export function ActionFailed({ error }: { error: Error | null }) {
  const { t } = useTranslation()
  if (!error) return null
  return (
    <PageMessage variant="error" title={t('common.actionFailed')}>
      {error.message}
    </PageMessage>
  )
}
