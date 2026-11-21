import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCan } from '../../auth/permissions'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, DataTable, Dropdown, Pagination, StatusIndicator, Tabs, type DataTableColumn, type TabItem } from '../../components/qi'
import { formatDate, formatDateTime } from '../../lib/format'
import { ApprovalStatus } from './ApprovalStatus'
import { PAGE_SIZE, useDecisions, useInstances, useMyTasks, useWorkflows } from './queries'
import { type Decision, INSTANCE_STATUSES, type InstanceListItem, type InstanceStatus, type MyTask } from './schemas'

type View = 'waiting' | 'mine' | 'all' | 'done'

const ITEM_LINK = 'font-semibold text-text-link underline-offset-4 hover:underline'

function ItemCell({ id, title, workflow }: { id: string; title: string; workflow: string }) {
  return (
    <span className="flex flex-col">
      <Link to={`/approvals/${id}`} className={ITEM_LINK}>
        {title}
      </Link>
      <span className="text-sm text-text-subdued">{workflow}</span>
    </span>
  )
}

function pageLabels(t: (key: string, options?: Record<string, unknown>) => string) {
  return { label: t('approvals.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n: number) => t('pagination.page', { page: n }) }
}

export function ApprovalCentrePage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const canAct = can('approvals:task:act')
  const tasks = useMyTasks(canAct)
  const canRead = can('approvals:instance:read')

  const tabs: TabItem<View>[] = [
    ...(canAct ? [{ value: 'waiting' as const, label: t('approvals.waiting'), count: tasks.data?.items.length }] : []),
    ...(canRead ? [{ value: 'mine' as const, label: t('approvals.mine') }, { value: 'all' as const, label: t('approvals.all') }] : []),
    ...(canAct ? [{ value: 'done' as const, label: t('approvals.done') }] : []),
  ]
  const requested = params.get('view') as View | null
  const view = tabs.find((tab) => tab.value === requested)?.value ?? tabs[0].value

  return (
    <>
      <PageHeader
        title={t('approvals.title')}
        intro={t('approvals.intro')}
        actions={
          can('approvals:delegation:manage') && (
            <Button variant="secondary" onClick={() => void navigate('/approvals/out-of-office')}>
              {t('approvals.outOfOffice')}
            </Button>
          )
        }
      />
      <Tabs<View>
        label={t('approvals.views')}
        tabs={tabs}
        value={view}
        onValueChange={(next) => setParams({ view: next })}
        countLabel={(count) => t('approvals.waitingCount', { count })}
      >
        {view === 'waiting' && <WaitingView tasks={tasks} />}
        {view === 'mine' && <InstancesView mine />}
        {view === 'all' && <InstancesView mine={false} />}
        {view === 'done' && <DoneView />}
      </Tabs>
    </>
  )
}

function WaitingView({ tasks }: { tasks: ReturnType<typeof useMyTasks> }) {
  const { t } = useTranslation()
  const columns: DataTableColumn<MyTask>[] = [
    { id: 'item', header: t('approvals.colItem'), cell: (task) => <ItemCell id={task.instance.id} title={task.instance.subjectTitle} workflow={task.instance.workflowName} /> },
    { id: 'step', header: t('approvals.colStep'), accessor: (task) => task.stepName },
    { id: 'requester', header: t('approvals.colRequester'), accessor: (task) => task.instance.submittedBy.name },
    { id: 'since', header: t('approvals.colSince'), accessor: (task) => formatDateTime(task.createdAt), sortable: true },
    {
      id: 'status',
      header: t('approvals.colStatus'),
      cell: (task) =>
        task.status === 'blocked' ? (
          <StatusIndicator tone="informative">{t('approvals.blocked')}</StatusIndicator>
        ) : (
          <StatusIndicator tone="attention">{t('approvals.taskStatus.pending')}</StatusIndicator>
        ),
    },
  ]
  if (tasks.isPending) return <Loading />
  if (tasks.isError) return <LoadFailed onRetry={() => void tasks.refetch()} />
  return (
    <DataTable caption={t('approvals.waiting')} hideCaption columns={columns} rows={tasks.data.items} getRowId={(task) => task.taskId} emptyState={t('approvals.noneWaiting')} />
  )
}

function InstancesView({ mine }: { mine: boolean }) {
  const { t } = useTranslation()
  const can = useCan()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<InstanceStatus | null>(null)
  const [workflowCode, setWorkflowCode] = useState<string | null>(null)
  const instances = useInstances({ mine, page, status: status ?? undefined, workflowCode: workflowCode ?? undefined })
  const showWorkflowFilter = !mine && can('approvals:rule-set:read')
  const workflows = useWorkflows()

  const columns: DataTableColumn<InstanceListItem>[] = [
    { id: 'item', header: t('approvals.colItem'), cell: (item) => <ItemCell id={item.id} title={item.subjectTitle} workflow={item.workflowName} /> },
    ...(mine ? [] : [{ id: 'requester', header: t('approvals.colRequester'), accessor: (item: InstanceListItem) => item.submittedBy.name }]),
    { id: 'status', header: t('approvals.colStatus'), cell: (item) => <ApprovalStatus status={item.status} /> },
    { id: 'submitted', header: t('approvals.colSubmitted'), accessor: (item) => formatDate(item.createdAt) },
  ]

  return (
    <div className="flex flex-col gap-4">
      {!mine && (
        <div className="grid gap-4 md:grid-cols-3">
          <Dropdown<InstanceStatus>
            label={t('approvals.filterStatus')}
            placeholder={t('approvals.anyStatus')}
            value={status}
            onValueChange={(next) => {
              setStatus(next)
              setPage(1)
            }}
            options={INSTANCE_STATUSES.map((value) => ({ value, label: t(`approvals.status.${value}`) }))}
          />
          {showWorkflowFilter && (
            <Dropdown<string>
              label={t('approvals.filterWorkflow')}
              placeholder={t('approvals.anyWorkflow')}
              value={workflowCode}
              onValueChange={(next) => {
                setWorkflowCode(next)
                setPage(1)
              }}
              options={(workflows.data?.items ?? []).map((workflow) => ({ value: workflow.code, label: workflow.name }))}
            />
          )}
        </div>
      )}
      {instances.isPending ? (
        <Loading />
      ) : instances.isError ? (
        <LoadFailed onRetry={() => void instances.refetch()} />
      ) : (
        <>
          <DataTable
            caption={mine ? t('approvals.mine') : t('approvals.all')}
            hideCaption
            columns={columns}
            rows={instances.data.items}
            getRowId={(item) => item.id}
            emptyState={mine ? t('approvals.noneMine') : t('approvals.noneAll')}
          />
          <Pagination page={page} pageCount={Math.ceil(instances.data.total / PAGE_SIZE)} onPageChange={setPage} labels={pageLabels(t)} />
        </>
      )}
    </div>
  )
}

function DoneView() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const decisions = useDecisions(page)
  const columns: DataTableColumn<Decision>[] = [
    { id: 'item', header: t('approvals.colItem'), cell: (d) => <ItemCell id={d.instance.id} title={d.instance.subjectTitle} workflow={d.instance.workflowName} /> },
    { id: 'step', header: t('approvals.colStep'), accessor: (d) => d.stepName },
    {
      id: 'decision',
      header: t('approvals.colDecision'),
      cell: (d) => <StatusIndicator tone={d.decision === 'approved' ? 'positive' : 'negative'}>{t(`approvals.decision.${d.decision}`)}</StatusIndicator>,
    },
    { id: 'comment', header: t('approvals.colComment'), accessor: (d) => d.comment ?? t('common.none') },
    { id: 'decided', header: t('approvals.colDecided'), accessor: (d) => formatDateTime(d.actedAt) },
  ]
  if (decisions.isPending) return <Loading />
  if (decisions.isError) return <LoadFailed onRetry={() => void decisions.refetch()} />
  return (
    <div className="flex flex-col gap-4">
      <DataTable caption={t('approvals.done')} hideCaption columns={columns} rows={decisions.data.items} getRowId={(d) => d.taskId} emptyState={t('approvals.noneDone')} />
      <Pagination page={page} pageCount={Math.ceil(decisions.data.total / PAGE_SIZE)} onPageChange={setPage} labels={pageLabels(t)} />
    </div>
  )
}
