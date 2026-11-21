import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useMe } from '../../auth/use-me'
import { ConfirmDialog } from '../../components/page/ConfirmDialog'
import { PageHeader } from '../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../components/page/QueryStates'
import { useDateLabels } from '../../components/page/useDateLabels'
import { Button, DataTable, DatePicker, Dialog, Textarea, type DataTableColumn } from '../../components/qi'
import { endOfDayMy, lastDayMy, startOfDayMy, todayMy } from '../../lib/dates'
import { formatDate } from '../../lib/format'
import { PersonPicker } from '../people/PersonPicker'
import type { Person } from '../people/schemas'
import { useCancelDelegation, useCreateDelegation, useDelegations } from './queries'
import type { Delegation } from './schemas'

/** What a new delegation needs; the page adds whose approvals it is for. */
export interface NewDelegation {
  toUserId: string
  startsAt: string
  endsAt: string
  reason?: string
}

/** /approvals/out-of-office — delegate new approval tasks while away. */
export function OutOfOfficePage() {
  const { t } = useTranslation()
  const me = useMe()
  const delegations = useDelegations()
  const cancel = useCancelDelegation()
  const create = useCreateDelegation()
  const [adding, setAdding] = useState(false)

  return (
    <>
      <Link to="/approvals" className="w-fit text-sm font-semibold text-text-link underline underline-offset-4">
        {t('delegation.back')}
      </Link>
      <PageHeader title={t('delegation.title')} intro={t('delegation.intro')} actions={<Button onClick={() => setAdding(true)}>{t('delegation.add')}</Button>} />
      <DelegationTable delegations={delegations} cancel={cancel} caption={t('delegation.caption')} empty={t('delegation.none')} />
      {adding && <AddDelegationDialog title={t('delegation.addTitle')} excludeId={me.user.id} create={create} onClose={() => setAdding(false)} />}
    </>
  )
}

/** Current and upcoming delegations, each with a cancel action. */
export function DelegationTable({
  delegations,
  cancel,
  caption,
  empty,
}: {
  delegations: UseQueryResult<{ items: Delegation[] }>
  cancel: UseMutationResult<Delegation, Error, string>
  caption: string
  empty: string
}) {
  const { t } = useTranslation()
  const [cancelling, setCancelling] = useState<Delegation | null>(null)

  const columns: DataTableColumn<Delegation>[] = [
    { id: 'delegate', header: t('delegation.colDelegate'), accessor: (d) => d.toUser.name },
    { id: 'from', header: t('delegation.colFrom'), accessor: (d) => formatDate(d.startsAt) },
    { id: 'to', header: t('delegation.colTo'), accessor: (d) => formatDate(lastDayMy(d.endsAt)) },
    { id: 'reason', header: t('delegation.colReason'), accessor: (d) => d.reason ?? t('common.none') },
    {
      id: 'actions',
      header: t('delegation.colActions'),
      cell: (d) => (
        <Button variant="tertiary" aria-label={t('delegation.cancelLabel', { name: d.toUser.name })} onClick={() => setCancelling(d)}>
          {t('delegation.cancel')}
        </Button>
      ),
    },
  ]

  return (
    <>
      {delegations.isPending ? (
        <Loading />
      ) : delegations.isError ? (
        <LoadFailed onRetry={() => void delegations.refetch()} />
      ) : (
        <DataTable caption={caption} hideCaption columns={columns} rows={delegations.data.items} getRowId={(d) => d.id} emptyState={empty} />
      )}
      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => {
          setCancelling(null)
          cancel.reset()
        }}
        title={t('delegation.cancelTitle', { name: cancelling?.toUser.name })}
        description={t('delegation.cancelBody')}
        confirmLabel={t('delegation.cancel')}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id, { onSuccess: () => setCancelling(null) })}
        pending={cancel.isPending}
        error={cancel.error}
      />
    </>
  )
}

/** A delegate who can act for staff (never `excludeId`, whose approvals these are), for whole days. */
export function AddDelegationDialog({
  title,
  excludeId,
  create,
  onClose,
}: {
  title: string
  excludeId: string
  create: UseMutationResult<Delegation, Error, NewDelegation>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const dateLabels = useDateLabels()
  const [delegate, setDelegate] = useState<Person | null>(null)
  const [from, setFrom] = useState<string | null>(todayMy())
  const [to, setTo] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const outOfOrder = Boolean(from && to && to < from)

  const submit = () => {
    setTried(true)
    if (!delegate || !from || !to || outOfOrder) return
    create.mutate(
      { toUserId: delegate.id, startsAt: startOfDayMy(from), endsAt: endOfDayMy(to), ...(reason.trim() && { reason: reason.trim() }) },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            {t('delegation.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ActionFailed error={create.error} />
        <PersonPicker
          label={t('delegation.delegate')}
          hint={t('delegation.delegateHint')}
          value={delegate}
          onChange={setDelegate}
          actsForStaff
          excludeIds={[excludeId]}
          error={tried && !delegate ? t('delegation.errors.delegate') : undefined}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <DatePicker label={t('delegation.from')} value={from} onChange={setFrom} min={todayMy()} labels={dateLabels} error={tried && !from ? t('delegation.errors.from') : undefined} />
          <DatePicker
            label={t('delegation.to')}
            value={to}
            onChange={setTo}
            min={from ?? todayMy()}
            labels={dateLabels}
            error={tried && !to ? t('delegation.errors.to') : outOfOrder ? t('delegation.errors.order') : undefined}
          />
        </div>
        <Textarea label={t('delegation.reason')} labelSuffix={t('common.optional')} value={reason} maxLength={500} rows={2} onChange={(event) => setReason(event.target.value)} />
      </div>
    </Dialog>
  )
}
