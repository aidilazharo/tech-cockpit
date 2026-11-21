import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useCan } from '../../auth/permissions'
import { useMe } from '../../auth/use-me'
import { ConfirmDialog } from '../../components/page/ConfirmDialog'
import { ActionFailed, LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, ButtonLink, PageMessage, StatusIndicator, Textarea, type StatusTone } from '../../components/qi'
import { ApiError } from '../../lib/api'
import { formatDate, formatDateTime } from '../../lib/format'
import { ApprovalStatus } from './ApprovalStatus'
import { DecisionDialog, type DecisionKind } from './DecisionDialog'
import { useInstance, useInstanceAction, useRespondInfo } from './queries'
import { ReassignDialog } from './ReassignDialog'
import type { Instance, InstanceTask, TaskStatus } from './schemas'

/** Where the record being approved is read (approvers open it from here). */
const SUBJECT_PAGES: Record<string, (id: string) => string> = {
  'sad-version': (id) => `/sad/versions/${id}`,
}

const TASK_TONE: Record<TaskStatus, StatusTone> = {
  pending: 'attention',
  blocked: 'informative',
  approved: 'positive',
  rejected: 'negative',
  info_requested: 'attention',
  superseded: 'ended',
}

const STEP_TONE: Record<string, StatusTone> = {
  approved: 'positive',
  active: 'informative',
  blocked: 'informative',
  returned: 'negative',
  awaiting_info: 'attention',
  cancelled: 'ended',
}

const ACTIVE = new Set(['in_progress', 'returned', 'awaiting_info'])

/** /approvals/:id — timeline, decision and the requester's actions. */
export function ApprovalPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const instance = useInstance(id)

  return (
    <>
      <Link to="/approvals" className="w-fit text-sm font-semibold text-text-link underline underline-offset-4">
        {t('approval.back')}
      </Link>
      {instance.isPending ? (
        <Loading />
      ) : instance.isError ? (
        instance.error instanceof ApiError && instance.error.status === 404 ? (
          <PageMessage variant="warning">{t('approval.notFound')}</PageMessage>
        ) : (
          <LoadFailed onRetry={() => void instance.refetch()} />
        )
      ) : (
        <ApprovalDetail instance={instance.data} />
      )}
    </>
  )
}

function ApprovalDetail({ instance }: { instance: Instance }) {
  const { t } = useTranslation()
  const me = useMe()
  const myTask = instance.tasks.find((task) => task.assignee.id === me.user.id && (task.status === 'pending' || task.status === 'blocked'))
  const isRequester = instance.submittedBy.id === me.user.id
  const contextEntries = Object.entries(instance.context)

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-text-subdued">{instance.workflowName}</p>
        <h1 className="heading-1">{instance.subjectTitle}</h1>
        <div className="flex flex-wrap items-center gap-4">
          <ApprovalStatus status={instance.status} />
          <span className="text-sm text-text-subdued">
            {t('approval.submittedBy', { name: instance.submittedBy.name, date: formatDate(instance.createdAt) })}
          </span>
          {instance.round > 1 && <span className="text-sm text-text-subdued">{t('approval.round', { round: instance.round })}</span>}
        </div>
        {SUBJECT_PAGES[instance.subjectType] && (
          <div>
            <ButtonLink to={SUBJECT_PAGES[instance.subjectType](instance.subjectId)} variant="secondary">
              {t(`approval.openSubject.${instance.subjectType}`)}
            </ButtonLink>
          </div>
        )}
      </div>

      {myTask?.status === 'pending' && <YourDecision task={myTask} instance={instance} />}
      {myTask?.status === 'blocked' && <PageMessage>{t('approval.blockedForYou', { step: stepName(instance, myTask) })}</PageMessage>}
      {instance.canActForSubmitter && ACTIVE.has(instance.status) && <YourRequest instance={instance} onBehalf={!isRequester} />}

      {instance.waitingOn.length > 0 && (
        <p>
          <span className="font-semibold">{t('approval.waitingOn')}: </span>
          {instance.waitingOn.map((person) => person.name).join(', ')}
        </p>
      )}

      {contextEntries.length > 0 && (
        <section aria-labelledby="approval-details" className="flex flex-col gap-3">
          <h2 id="approval-details" className="heading-3">
            {t('approval.details')}
          </h2>
          <dl className="grid gap-3 md:grid-cols-3">
            {contextEntries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-sm font-semibold text-text-subdued">{key}</dt>
                <dd>{value === null ? <span className="text-text-subdued italic">{t('common.restricted')}</span> : String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <Timeline instance={instance} />
    </>
  )
}

/** Every task belongs to a step of its own instance (the API keeps them together). */
function stepName(instance: Instance, task: InstanceTask): string {
  return instance.steps.find((step) => step.key === task.stepKey)!.name
}

function YourDecision({ task, instance }: { task: InstanceTask; instance: Instance }) {
  const { t } = useTranslation()
  const [deciding, setDeciding] = useState<DecisionKind | null>(null)
  return (
    <section aria-labelledby="your-decision" className="flex flex-col gap-3 rounded-card border border-divider-bold p-4">
      <h2 id="your-decision" className="heading-4">
        {t('approval.yourDecision')}
      </h2>
      <p>{t('approval.yourDecisionIntro', { step: stepName(instance, task) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDeciding('approve')}>{t('approval.approve')}</Button>
        <Button variant="secondary" onClick={() => setDeciding('reject')}>
          {t('approval.reject')}
        </Button>
        <Button variant="tertiary" onClick={() => setDeciding('request-info')}>
          {t('approval.requestInfo')}
        </Button>
      </div>
      {deciding && <DecisionDialog kind={deciding} taskId={task.id} subjectTitle={instance.subjectTitle} onClose={() => setDeciding(null)} />}
    </section>
  )
}

/** The submitter's actions; also for people allowed to act for submitters (`onBehalf`). */
function YourRequest({ instance, onBehalf }: { instance: Instance; onBehalf: boolean }) {
  const { t } = useTranslation()
  const respond = useRespondInfo(instance.id)
  const resubmit = useInstanceAction(instance.id, 'resubmit')
  const cancel = useInstanceAction(instance.id, 'cancel')
  const [answer, setAnswer] = useState('')
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState<'resubmit' | 'cancel' | null>(null)
  const question = instance.tasks.find((task) => task.status === 'info_requested')
  const pending = confirming === 'resubmit' ? resubmit : cancel

  return (
    <section aria-labelledby="your-request" className="flex flex-col gap-3 rounded-card border border-divider-bold p-4">
      <h2 id="your-request" className="heading-4">
        {onBehalf ? t('approval.forSubmitter', { name: instance.submittedBy.name }) : t('approval.yourRequest')}
      </h2>
      {instance.status === 'awaiting_info' && question && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            setTried(true)
            if (answer.trim()) respond.mutate(answer.trim())
          }}
        >
          <p className="font-semibold">{t('approval.answerTitle', { name: question.assignee.name, question: question.comment })}</p>
          <ActionFailed error={respond.error} />
          <Textarea
            label={t('approval.answerLabel')}
            value={answer}
            maxLength={2000}
            onChange={(event) => setAnswer(event.target.value)}
            error={tried && !answer.trim() ? t('approval.answerRequired') : undefined}
          />
          <Button type="submit" className="w-fit" loading={respond.isPending}>
            {t('approval.sendAnswer')}
          </Button>
        </form>
      )}
      {instance.status === 'returned' && <p>{onBehalf ? t('approval.returnedIntroFor', { name: instance.submittedBy.name }) : t('approval.returnedIntro')}</p>}
      <div className="flex flex-wrap gap-2">
        {instance.status === 'returned' && <Button onClick={() => setConfirming('resubmit')}>{t('approval.resubmit')}</Button>}
        <Button variant="tertiary" onClick={() => setConfirming('cancel')}>
          {t('approval.cancelRequest')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        onClose={() => {
          setConfirming(null)
          resubmit.reset()
          cancel.reset()
        }}
        title={confirming === 'resubmit' ? t('approval.resubmitTitle', { title: instance.subjectTitle }) : t('approval.cancelTitle', { title: instance.subjectTitle })}
        description={confirming === 'resubmit' ? t('approval.resubmitBody') : t('approval.cancelBody')}
        confirmLabel={confirming === 'resubmit' ? t('approval.resubmit') : t('approval.cancelRequest')}
        onConfirm={() => pending.mutate(undefined, { onSuccess: () => setConfirming(null) })}
        pending={pending.isPending}
        error={pending.error}
      />
    </section>
  )
}

function Timeline({ instance }: { instance: Instance }) {
  const { t } = useTranslation()
  const can = useCan()
  const [reassigning, setReassigning] = useState<InstanceTask | null>(null)
  const canReassign = can('approvals:task:reassign') && ACTIVE.has(instance.status)

  return (
    <section aria-labelledby="approval-steps" className="flex flex-col gap-4">
      <h2 id="approval-steps" className="heading-3">
        {t('approval.steps')}
      </h2>
      <ol className="flex flex-col gap-4">
        {instance.steps.map((step) => {
          const tasks = instance.tasks.filter((task) => task.stepKey === step.key).sort((a, b) => b.round - a.round)
          const tone = STEP_TONE[step.status]
          return (
            <li key={step.key} className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="heading-4">{step.name}</h3>
                {tone ? (
                  <StatusIndicator tone={tone}>{t(`approvals.stepStatus.${step.status}`)}</StatusIndicator>
                ) : (
                  <span className="text-sm text-text-subdued">{t(`approvals.stepStatus.${step.status}`, { defaultValue: step.status })}</span>
                )}
              </div>
              {tasks.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {tasks.map((task) => (
                    <li key={task.id} className="flex flex-col gap-1 border-t border-divider-default pt-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold">{task.assignee.name}</span>
                        {task.originalAssignee && task.originalAssignee.id !== task.assignee.id && (
                          <span className="text-sm text-text-subdued">{t('approval.onBehalfOf', { name: task.originalAssignee.name })}</span>
                        )}
                        <StatusIndicator tone={TASK_TONE[task.status]}>{t(`approvals.taskStatus.${task.status}`)}</StatusIndicator>
                        {instance.round > 1 && <span className="text-xs text-text-subdued">{t('approval.round', { round: task.round })}</span>}
                        {canReassign && (task.status === 'pending' || task.status === 'blocked') && (
                          <Button variant="tertiary" aria-label={t('approval.reassignLabel', { name: task.assignee.name })} onClick={() => setReassigning(task)}>
                            {t('approval.reassign')}
                          </Button>
                        )}
                      </div>
                      {task.comment && (
                        <p className="text-sm">
                          <span className="font-semibold">{task.status === 'info_requested' || task.response ? t('approval.question') : t('approval.comment')}: </span>
                          {task.comment}
                        </p>
                      )}
                      {task.response && (
                        <p className="text-sm">
                          <span className="font-semibold">{t('approval.answer')}: </span>
                          {task.response}
                        </p>
                      )}
                      {task.reassignReason && (
                        <p className="text-sm text-text-subdued">
                          {task.reassignReason === 'sla-escalation' ? t('approval.escalatedReason') : t('approval.reassigned', { reason: task.reassignReason })}
                        </p>
                      )}
                      {task.actedAt && <p className="text-xs text-text-subdued">{formatDateTime(task.actedAt)}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      {reassigning && (
        <ReassignDialog
          taskId={reassigning.id}
          assigneeName={reassigning.assignee.name}
          excludeIds={[reassigning.assignee.id, instance.submittedBy.id]}
          onClose={() => setReassigning(null)}
        />
      )}
    </section>
  )
}
