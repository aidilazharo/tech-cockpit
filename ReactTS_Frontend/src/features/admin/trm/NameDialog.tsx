import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionFailed } from '../../../components/page/QueryStates'
import { Button, Dialog, TextField } from '../../../components/qi'

/** Add or rename something with just a name (domains, sub-domains, layers). */
export function NameDialog({
  title,
  initial = '',
  submitLabel,
  pending,
  error,
  onSave,
  onClose,
}: {
  title: string
  initial?: string
  submitLabel: string
  pending: boolean
  error: Error | null
  onSave: (name: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial)
  const [tried, setTried] = useState(false)
  const save = () => {
    setTried(true)
    if (name.trim()) onSave(name.trim())
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
          <Button loading={pending} onClick={save}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ActionFailed error={error} />
        <TextField label={t('portfolios.name')} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} error={tried && !name.trim() ? t('portfolios.nameRequired') : undefined} />
      </div>
    </Dialog>
  )
}
