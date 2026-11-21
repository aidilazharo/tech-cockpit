import { useTranslation } from 'react-i18next'
import { DataTable } from '../../components/qi'
import { formatDate } from '../../lib/format'
import type { HistoryAction, HistoryRow, Version } from './schemas'
import { useVersionLabel } from './version-label'

/** The state a row leaves the version in; decisions, questions and answers show the step they were at. */
const STATE: Partial<Record<HistoryAction, 'draft' | 'inApproval' | 'current'>> = {
  started: 'draft',
  submitted: 'inApproval',
  resubmitted: 'inApproval',
  withdrawn: 'draft',
  version_approved: 'current',
}

/** The template's Version Control table: what happened to the version, in date order. */
export function VersionHistory({ version }: { version: Version }) {
  const { t } = useTranslation()
  const label = useVersionLabel()(version)
  // Every row but "Version approved" names who did it: no name means the reader may not see names.
  const user = (row: HistoryRow) => (row.user ? row.user.name : row.action === 'version_approved' ? '' : t('common.restricted'))
  const state = (row: HistoryRow) => {
    const own = STATE[row.action]
    return own ? t(`sad.history.states.${own}`) : row.step
  }
  return (
    <section aria-labelledby="version-history" className="flex flex-col gap-3">
      <h2 id="version-history" className="heading-3">
        {t('sad.history.title')}
      </h2>
      <DataTable
        caption={t('sad.history.title')}
        hideCaption
        rows={version.history}
        getRowId={(row) => `${row.action}-${row.at}`}
        columns={[
          { id: 'user', header: t('sad.history.user'), cell: user },
          { id: 'action', header: t('sad.history.action'), cell: (row) => t(`sad.history.actions.${row.action}`) },
          { id: 'state', header: t('sad.history.state'), cell: state },
          { id: 'comment', header: t('sad.history.comment'), cell: (row) => row.comment },
          { id: 'date', header: t('sad.history.date'), cell: (row) => formatDate(row.at) },
          { id: 'version', header: t('sad.history.version'), cell: () => label },
        ]}
      />
    </section>
  )
}
