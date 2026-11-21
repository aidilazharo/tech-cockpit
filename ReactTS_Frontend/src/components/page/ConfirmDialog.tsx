import { useTranslation } from 'react-i18next'
import { Button, Dialog } from '../qi'
import { ActionFailed } from './QueryStates'

export interface ConfirmDialogProps {
  open: boolean
  /** Cancel or Escape */
  onClose: () => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  pending?: boolean
  error?: Error | null
}

/** Confirmation for destructive or significant actions (Qi alert dialog: the user must choose). */
export function ConfirmDialog({ open, onClose, title, description, confirmLabel, onConfirm, pending, error }: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="alert"
      title={title}
      description={description}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <ActionFailed error={error ?? null} />
    </Dialog>
  )
}
