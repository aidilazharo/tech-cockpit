import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionFailed } from '../../components/page/QueryStates'
import { Button, Dialog, Textarea } from '../../components/qi'
import { useTaskAction } from './queries'

export type DecisionKind = 'approve' | 'reject' | 'request-info'

const COPY: Record<DecisionKind, { title: string; field: string; hint?: string; required?: string; confirm: string }> = {
  approve: { title: 'approval.approveTitle', field: 'approval.approveComment', confirm: 'approval.approve' },
  reject: { title: 'approval.rejectTitle', field: 'approval.rejectComment', hint: 'approval.rejectHint', required: 'approval.commentRequired', confirm: 'approval.reject' },
  'request-info': { title: 'approval.requestInfoTitle', field: 'approval.requestInfoComment', hint: 'approval.requestInfoHint', required: 'approval.questionRequired', confirm: 'approval.requestInfo' },
}

/** Approve (comment optional), reject (reason required) or ask a question (question required). */
export function DecisionDialog({ kind, taskId, subjectTitle, onClose }: { kind: DecisionKind; taskId: string; subjectTitle: string; onClose: () => void }) {
  const { t } = useTranslation()
  const action = useTaskAction(kind)
  const [comment, setComment] = useState('')
  const [missing, setMissing] = useState(false)
  const copy = COPY[kind]

  const submit = () => {
    if (copy.required && !comment.trim()) {
      setMissing(true)
      return
    }
    action.mutate({ taskId, comment: comment.trim() }, { onSuccess: onClose })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(copy.title, { title: subjectTitle })}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={action.isPending}>
            {t(copy.confirm)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ActionFailed error={action.error} />
        <Textarea
          label={t(copy.field)}
          labelSuffix={copy.required ? undefined : t('common.optional')}
          hint={copy.hint && t(copy.hint)}
          value={comment}
          maxLength={2000}
          onChange={(event) => {
            setComment(event.target.value)
            setMissing(false)
          }}
          error={missing && copy.required ? t(copy.required) : undefined}
        />
      </div>
    </Dialog>
  )
}
