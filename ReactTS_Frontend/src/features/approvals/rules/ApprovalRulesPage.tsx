import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useCan } from '../../../auth/permissions'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, Checkbox, DataTable, StatusIndicator, type DataTableColumn, type StatusTone } from '../../../components/qi'
import { formatDate } from '../../../lib/format'
import { useRuleSets, useUpdateWorkflow, useWorkflows } from '../queries'
import { RuleSetDefinitionSchema, type RuleSet, type Workflow } from '../schemas'

const STATUS_TONE: Record<RuleSet['status'], StatusTone> = { draft: 'attention', published: 'positive', retired: 'ended' }

/** /admin/approval-rules — every approvable workflow and its rule versions. */
export function ApprovalRulesPage() {
  const { t } = useTranslation()
  const workflows = useWorkflows()
  return (
    <>
      <PageHeader title={t('rules.title')} intro={t('rules.intro')} />
      {workflows.isPending ? (
        <Loading />
      ) : workflows.isError ? (
        <LoadFailed onRetry={() => void workflows.refetch()} />
      ) : workflows.data.items.length === 0 ? (
        <p className="text-text-subdued">{t('rules.none')}</p>
      ) : (
        workflows.data.items.map((workflow) => <WorkflowRules key={workflow.code} workflow={workflow} />)
      )}
    </>
  )
}

function WorkflowRules({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const ruleSets = useRuleSets(workflow.code)
  const setting = useUpdateWorkflow(workflow.code)
  const published = ruleSets.data?.items.find((set) => set.status === 'published')
  const headingId = `workflow-${workflow.code}`

  const columns: DataTableColumn<RuleSet>[] = [
    {
      id: 'version',
      header: t('rules.colVersion'),
      cell: (set) => (
        <Link to={`/admin/approval-rules/${set.id}`} aria-label={t('rules.open', { version: set.ruleVersion })} className="font-semibold text-text-link underline-offset-4 hover:underline">
          {set.ruleVersion}
        </Link>
      ),
    },
    { id: 'status', header: t('rules.colStatus'), cell: (set) => <StatusIndicator tone={STATUS_TONE[set.status]}>{t(`rules.status.${set.status}`)}</StatusIndicator> },
    { id: 'rules', header: t('rules.colRules'), accessor: (set) => RuleSetDefinitionSchema.safeParse(set.definition).data?.rules.length ?? 0 },
    { id: 'published', header: t('rules.colPublished'), accessor: (set) => formatDate(set.publishedAt) ?? t('common.none') },
  ]

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="heading-3">
            {workflow.name}
          </h2>
          {workflow.description && <p className="text-text-subdued">{workflow.description}</p>}
          <p className="text-sm text-text-subdued">{t('rules.fields', { fields: workflow.contextFields.join(', ') || t('common.none') })}</p>
          {can('approvals:rule-set:manage') ? (
            <>
              <Checkbox
                label={t('rules.approversSeeFinancials')}
                description={t('rules.approversSeeFinancialsHint')}
                checked={workflow.approversSeeFinancials}
                disabled={setting.isPending}
                onCheckedChange={(checked) => setting.mutate(checked)}
              />
              <ActionFailed error={setting.error} />
            </>
          ) : (
            <p className="text-sm text-text-subdued">{workflow.approversSeeFinancials ? t('rules.financialsVisible') : t('rules.financialsHidden')}</p>
          )}
        </div>
        {can('approvals:rule-set:manage') && ruleSets.isSuccess && (
          <Button
            variant={published ? 'secondary' : 'primary'}
            onClick={() => void navigate(`/admin/approval-rules/new?workflow=${encodeURIComponent(workflow.code)}${published ? `&from=${published.id}` : ''}`)}
          >
            {published ? t('rules.newDraftFromPublished') : t('rules.newDraft')}
          </Button>
        )}
      </div>
      {ruleSets.isPending ? (
        <Loading />
      ) : ruleSets.isError ? (
        <LoadFailed onRetry={() => void ruleSets.refetch()} />
      ) : (
        <DataTable caption={`${workflow.name}: ${t('rules.caption')}`} hideCaption columns={columns} rows={ruleSets.data.items} getRowId={(set) => set.id} emptyState={t('rules.noVersions')} />
      )}
    </section>
  )
}
