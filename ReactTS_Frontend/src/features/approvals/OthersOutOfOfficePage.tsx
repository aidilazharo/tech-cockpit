import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/page/PageHeader'
import { Button } from '../../components/qi'
import { PersonPicker } from '../people/PersonPicker'
import type { Person } from '../people/schemas'
import { AddDelegationDialog, DelegationTable, type NewDelegation } from './OutOfOfficePage'
import { useCancelDelegationFor, useCreateDelegationFor, useDelegationsOf } from './queries'

/** /admin/out-of-office — someone else's out-of-office delegations (approvals:any-delegation:manage). */
export function OthersOutOfOfficePage() {
  const { t } = useTranslation()
  const [person, setPerson] = useState<Person | null>(null)

  return (
    <>
      <PageHeader title={t('delegation.othersTitle')} intro={t('delegation.othersIntro')} />
      <div className="max-w-md">
        <PersonPicker label={t('delegation.person')} value={person} onChange={setPerson} />
      </div>
      {person && <PersonDelegations key={person.id} person={person} />}
    </>
  )
}

function PersonDelegations({ person }: { person: Person }) {
  const { t } = useTranslation()
  const delegations = useDelegationsOf(person.id)
  const cancel = useCancelDelegationFor()
  const createFor = useCreateDelegationFor()
  // The dialog sends a delegation; this adds whose approvals it is for.
  const create = useMutation({ mutationFn: (body: NewDelegation) => createFor.mutateAsync({ ...body, fromUserId: person.id }) })
  const [adding, setAdding] = useState(false)

  return (
    <section aria-labelledby="person-delegations" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="person-delegations" className="heading-3">
          {t('delegation.captionFor', { name: person.name })}
        </h2>
        <Button onClick={() => setAdding(true)}>{t('delegation.add')}</Button>
      </div>
      <DelegationTable delegations={delegations} cancel={cancel} caption={t('delegation.captionFor', { name: person.name })} empty={t('delegation.noneFor', { name: person.name })} />
      {adding && <AddDelegationDialog title={t('delegation.addTitleFor', { name: person.name })} excludeId={person.id} create={create} onClose={() => setAdding(false)} />}
    </section>
  )
}
