import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../../components/page/ConfirmDialog'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, DataTable, type DataTableColumn } from '../../../components/qi'
import { formatDateTime } from '../../../lib/format'
import { useDismissRefusedSignIn, useRefusedSignIns } from '../queries'
import type { RefusedSignIn } from '../schemas'
import type { UserPrefill } from './AddUserDialog'

/** People Okta signed in who have not been added (kept 90 days): add them with the form filled in, or dismiss. */
export function RefusedSignIns({ onAdd }: { onAdd: (prefill: UserPrefill) => void }) {
  const { t } = useTranslation()
  const refused = useRefusedSignIns(true)
  const dismiss = useDismissRefusedSignIn()
  const [dismissing, setDismissing] = useState<RefusedSignIn | null>(null)

  const columns: DataTableColumn<RefusedSignIn>[] = [
    { id: 'username', header: t('refused.colUsername'), accessor: (entry) => entry.username },
    { id: 'name', header: t('refused.colName'), accessor: (entry) => `${entry.firstName} ${entry.lastName}`.trim() || t('common.none') },
    { id: 'email', header: t('refused.colEmail'), accessor: (entry) => entry.email ?? t('common.none') },
    { id: 'attempts', header: t('refused.colAttempts'), accessor: (entry) => String(entry.attempts) },
    { id: 'last', header: t('refused.colLast'), accessor: (entry) => formatDateTime(entry.lastAttemptAt) },
    {
      id: 'actions',
      header: t('refused.colActions'),
      cell: (entry) => (
        <span className="flex flex-wrap gap-2">
          <Button variant="secondary" aria-label={t('refused.addLabel', { username: entry.username })} onClick={() => onAdd(entry)}>
            {t('refused.add')}
          </Button>
          <Button variant="tertiary" aria-label={t('refused.dismissLabel', { username: entry.username })} onClick={() => setDismissing(entry)}>
            {t('refused.dismiss')}
          </Button>
        </span>
      ),
    },
  ]

  return (
    <section aria-labelledby="refused-sign-ins" className="flex flex-col gap-4">
      <h2 id="refused-sign-ins" className="heading-3">
        {t('refused.title')}
      </h2>
      <p className="text-text-subdued">{t('refused.intro')}</p>
      {refused.isPending ? (
        <Loading />
      ) : refused.isError ? (
        <LoadFailed onRetry={() => void refused.refetch()} />
      ) : (
        <DataTable caption={t('refused.title')} hideCaption columns={columns} rows={refused.data.items} getRowId={(entry) => entry.id} emptyState={t('refused.none')} />
      )}
      <ConfirmDialog
        open={dismissing !== null}
        onClose={() => {
          setDismissing(null)
          dismiss.reset()
        }}
        title={t('refused.dismissTitle', { username: dismissing?.username })}
        description={t('refused.dismissBody')}
        confirmLabel={t('refused.dismiss')}
        onConfirm={() => dismissing && dismiss.mutate(dismissing.id, { onSuccess: () => setDismissing(null) })}
        pending={dismiss.isPending}
        error={dismiss.error}
      />
    </section>
  )
}
