import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, DataTable, Dialog, StatusIndicator, TextField } from '../../../components/qi'
import { useRetention, useSaveRetention } from '../../sad/queries'
import type { RetentionStandard } from '../../sad/schemas'

const FIELDS = ['serviceType', 'dataType', 'yearly', 'monthly', 'weekly', 'daily'] as const
type Field = (typeof FIELDS)[number]

function RetentionDialog({ row, onClose }: { row: RetentionStandard | null; onClose: () => void }) {
  const { t } = useTranslation()
  const save = useSaveRetention()
  const [values, setValues] = useState<Record<Field | 'comment', string>>({
    serviceType: row?.serviceType ?? '',
    dataType: row?.dataType ?? '',
    yearly: row?.yearly ?? '',
    monthly: row?.monthly ?? '',
    weekly: row?.weekly ?? '',
    daily: row?.daily ?? '',
    comment: row?.comment ?? '',
  })
  const [tried, setTried] = useState(false)
  const missing = FIELDS.filter((field) => values[field].trim() === '')
  const submit = () => {
    setTried(true)
    if (missing.length > 0) return
    const fields = { ...Object.fromEntries(FIELDS.map((field) => [field, values[field].trim()])), comment: values.comment.trim() || null } as Record<Field, string> & { comment: string | null }
    save.mutate({ id: row?.id ?? null, body: row ? { ...fields, version: row.version } : fields }, { onSuccess: onClose })
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? t('sad.retention.editTitle') : t('sad.retention.addTitle')}
      actions={
        <Button loading={save.isPending} onClick={submit}>
          {t('sad.retention.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {FIELDS.map((field) => (
          <TextField
            key={field}
            label={t(`sad.retention.${field}`)}
            value={values[field]}
            onChange={(event) => setValues({ ...values, [field]: event.target.value })}
            error={tried && missing.includes(field) ? t('sad.retention.required') : undefined}
          />
        ))}
        <TextField label={t('sad.retention.comment')} labelSuffix={t('sad.editor.optional')} value={values.comment} onChange={(event) => setValues({ ...values, comment: event.target.value })} />
        <ActionFailed error={save.error} />
      </div>
    </Dialog>
  )
}

/** /admin/sad-retention — AIA's standard backup retention rows that SAD backup schedules tick. */
export function RetentionPage() {
  const { t } = useTranslation()
  const rows = useRetention()
  const save = useSaveRetention()
  const [editing, setEditing] = useState<RetentionStandard | 'new' | null>(null)

  return (
    <>
      <PageHeader
        title={t('sad.retention.title')}
        intro={t('sad.retention.intro')}
        actions={<Button onClick={() => setEditing('new')}>{t('sad.retention.add')}</Button>}
      />
      <ActionFailed error={save.error} />
      {rows.isPending ? (
        <Loading />
      ) : rows.isError ? (
        <LoadFailed onRetry={() => void rows.refetch()} />
      ) : (
        <DataTable
          caption={t('sad.retention.title')}
          hideCaption
          rows={rows.data.items}
          getRowId={(row) => row.id}
          emptyState={t('sad.retention.none')}
          columns={[
            { id: 'serviceType', header: t('sad.retention.serviceType'), accessor: (row) => row.serviceType },
            { id: 'dataType', header: t('sad.retention.dataType'), accessor: (row) => row.dataType },
            { id: 'yearly', header: t('sad.retention.yearly'), accessor: (row) => row.yearly },
            { id: 'monthly', header: t('sad.retention.monthly'), accessor: (row) => row.monthly },
            { id: 'weekly', header: t('sad.retention.weekly'), accessor: (row) => row.weekly },
            { id: 'daily', header: t('sad.retention.daily'), accessor: (row) => row.daily },
            { id: 'comment', header: t('sad.retention.comment'), accessor: (row) => row.comment ?? '' },
            { id: 'active', header: t('sad.retention.state'), cell: (row) => <StatusIndicator tone={row.active ? 'positive' : 'ended'}>{row.active ? t('sad.retention.active') : t('sad.retention.retired')}</StatusIndicator> },
            {
              id: 'actions',
              header: t('sad.retention.actions'),
              cell: (row) => (
                <div className="flex flex-wrap gap-1">
                  <Button variant="tertiary" onClick={() => setEditing(row)}>
                    {t('sad.retention.edit', { name: `${row.serviceType} — ${row.dataType}` })}
                  </Button>
                  <Button variant="tertiary" onClick={() => save.mutate({ id: row.id, body: { active: !row.active, version: row.version } })}>
                    {row.active ? t('sad.retention.retire', { name: `${row.serviceType} — ${row.dataType}` }) : t('sad.retention.restore', { name: `${row.serviceType} — ${row.dataType}` })}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      {editing && <RetentionDialog row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
