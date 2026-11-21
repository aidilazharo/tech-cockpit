import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { DataTable, PageMessage, StatusIndicator } from '../../components/qi'
import { formatDateTime } from '../../lib/format'
import { BackLink, DetailStates, Details, Section } from './parts'
import { useSyncRun } from './queries'
import type { SyncReport, SyncRun } from './schemas'
import { RUN_TONES } from './sync-status'
import { useText } from './text'

/** /admin/trm-sync/:id — what a run changed and what it could not match. */
export function SyncRunPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const run = useSyncRun(id)
  return (
    <>
      <BackLink to="/admin/trm-sync">{t('trm.sync.back')}</BackLink>
      <DetailStates query={run} notFound={t('trm.sync.notFound')}>
        {(data) => <RunDetail run={data} />}
      </DetailStates>
    </>
  )
}

function RunDetail({ run }: { run: SyncRun }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="heading-1">{t('trm.sync.runTitle', { date: formatDateTime(run.createdAt) })}</h1>
        <StatusIndicator tone={RUN_TONES[run.status]}>{t(`trm.sync.status.${run.status}`)}</StatusIndicator>
      </div>
      {run.dryRun && <PageMessage>{t('trm.sync.dryRunNote')}</PageMessage>}
      {run.error && <PageMessage variant="error">{run.error}</PageMessage>}
      <Details
        items={[
          [t('trm.sync.colBy'), run.startedBy.name],
          [t('trm.sync.colCompleted'), formatDateTime(run.completedAt) ?? t('common.none')],
          [t('trm.sync.received'), Object.entries(run.received).map(([file, rows]) => `${file}: ${rows}`).join(', ') || t('common.none')],
        ]}
      />
      {run.report ? <Report report={run.report} /> : <p className="text-text-subdued">{t('trm.sync.noReport')}</p>}
    </>
  )
}

function Report({ report }: { report: SyncReport }) {
  const { t } = useTranslation()
  const { named } = useText()
  return (
    <>
      <Section id="trm-sync-records" title={t('trm.sync.records')}>
        <DataTable
          caption={t('trm.sync.records')}
          hideCaption
          rows={report.records}
          getRowId={(r) => r.recordType}
          columns={[
            { id: 'type', header: t('trm.sync.colRecordType'), accessor: (r) => t(`trm.sync.recordType.${r.recordType}`) },
            { id: 'received', header: t('trm.sync.colReceived'), accessor: (r) => r.received },
            { id: 'inserted', header: t('trm.sync.colInserted'), accessor: (r) => r.inserted },
            { id: 'updated', header: t('trm.sync.colUpdated'), accessor: (r) => r.updated },
            { id: 'unchanged', header: t('trm.sync.colUnchanged'), accessor: (r) => r.unchanged },
            { id: 'missing', header: t('trm.sync.colNowMissing'), accessor: (r) => r.nowMissing },
            { id: 'returned', header: t('trm.sync.colReturned'), accessor: (r) => r.returned },
            { id: 'refreshed', header: t('trm.sync.colExport'), accessor: (r) => (r.refreshed ? t('trm.sync.included') : t('trm.sync.notIncluded')) },
          ]}
        />
      </Section>
      <Section id="trm-sync-links" title={t('trm.sync.links')}>
        <DataTable
          caption={t('trm.sync.links')}
          hideCaption
          rows={report.links.map((link) => ({ ...link, id: `${link.linkType}-${link.source}` }))}
          getRowId={(link) => link.id}
          emptyState={t('trm.sync.noLinks')}
          columns={[
            { id: 'type', header: t('trm.sync.colLinkType'), accessor: (link) => t(`trm.sync.linkType.${link.linkType}`) },
            { id: 'source', header: t('trm.sync.colSource'), cell: (link) => <code className="text-sm">{link.source}</code> },
            { id: 'count', header: t('trm.sync.colCount'), accessor: (link) => link.count },
          ]}
        />
      </Section>
      <Section id="trm-sync-problems" title={t('trm.sync.problems')}>
        {report.capabilityMismatches > 0 && <p>{t('trm.sync.mismatches', { count: report.capabilityMismatches })}</p>}
        {report.truncated && <PageMessage variant="warning">{t('trm.sync.truncated')}</PageMessage>}
        <DataTable
          caption={t('trm.sync.unmatched')}
          rows={report.unmatched.map((u, index) => ({ ...u, id: String(index) }))}
          getRowId={(u) => u.id}
          emptyState={t('trm.sync.noUnmatched')}
          columns={[
            { id: 'file', header: t('trm.sync.colFile'), cell: (u) => <code className="text-sm">{u.file}</code> },
            { id: 'field', header: t('trm.sync.colField'), cell: (u) => <code className="text-sm">{u.field}</code> },
            { id: 'name', header: t('trm.sync.colName'), accessor: (u) => u.name },
            { id: 'problem', header: t('trm.sync.colProblem'), accessor: (u) => t(`trm.sync.problem.${u.problem}`) },
            { id: 'rows', header: t('trm.sync.colRows'), accessor: (u) => u.rows },
          ]}
        />
        <DataTable
          caption={t('trm.sync.skipped')}
          rows={report.skipped.map((s, index) => ({ ...s, id: String(index) }))}
          getRowId={(s) => s.id}
          emptyState={t('trm.sync.noSkipped')}
          columns={[
            { id: 'file', header: t('trm.sync.colFile'), cell: (s) => <code className="text-sm">{s.file}</code> },
            { id: 'row', header: t('trm.sync.colRow'), accessor: (s) => s.row },
            { id: 'reason', header: t('trm.sync.colReason'), accessor: (s) => s.reason },
          ]}
        />
        <DataTable
          caption={t('trm.sync.capabilityIssues')}
          rows={report.capabilityIssues.map((issue, index) => ({ ...issue, id: String(index) }))}
          getRowId={(issue) => issue.id}
          emptyState={t('trm.sync.noCapabilityIssues')}
          columns={[
            { id: 'name', header: t('trm.sync.colName'), accessor: (issue) => named(issue.name) },
            { id: 'problem', header: t('trm.sync.colProblem'), accessor: (issue) => t(`trm.sync.capabilityProblem.${issue.problem}`, { defaultValue: issue.problem }) },
          ]}
        />
      </Section>
    </>
  )
}
