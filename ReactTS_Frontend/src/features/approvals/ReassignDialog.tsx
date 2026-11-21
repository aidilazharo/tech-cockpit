import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionFailed } from '../../components/page/QueryStates'
import { Button, Dialog, Textarea } from '../../components/qi'
import { PersonPicker } from '../people/PersonPicker'
import type { Person } from '../people/schemas'
import { useReassignTask } from './queries'

/** Administrators move an open task to another approver, with a recorded reason. */
export function ReassignDialog({ taskId, assigneeName, excludeIds, onClose }: { taskId: string; assigneeName: string; excludeIds: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const reassign = useReassignTask()
  const [person, setPerson] = useState<Person | null>(null)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const personError = tried && !person ? t('approval.reassignPersonRequired') : undefined
  const reasonError = tried && reason.trim().length < 3 ? t('approval.reassignReasonRequired') : undefined

  const submit = () => {
    setTried(true)
    if (!person || reason.trim().length < 3) return
    reassign.mutate({ taskId, toUserId: person.id, reason: reason.trim() }, { onSuccess: onClose })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('approval.reassignTitle', { name: assigneeName })}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={reassign.isPending}>
            {t('approval.reassign')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ActionFailed error={reassign.error} />
        <PersonPicker label={t('approval.reassignTo')} value={person} onChange={setPerson} excludeIds={excludeIds} error={personError} />
        <Textarea
          label={t('approval.reassignReason')}
          hint={t('approval.reassignReasonHint')}
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(event) => setReason(event.target.value)}
          error={reasonError}
        />
      </div>
    </Dialog>
  )
}
