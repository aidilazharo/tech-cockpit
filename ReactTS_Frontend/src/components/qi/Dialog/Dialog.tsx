import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { CloseIcon } from '../icons'

export interface DialogProps {
  open: boolean
  /** Escape, the close button, or (default variant) a click outside. The page decides when it opens. */
  onClose: () => void
  title: string
  description?: string
  /** Body content. Keep it to one task (Qi): no navigation inside dialogs. */
  children?: ReactNode
  /** Footer buttons, primary action last. */
  actions?: ReactNode
  /**
   * `alert`: errors or destructive confirmations. Uses role="alertdialog", cannot be
   * dismissed by clicking outside, and has no close button so the user must choose.
   */
  variant?: 'default' | 'alert'
  /** Show the close (X) button. Qi: omit it when the user must pick an action. */
  dismissible?: boolean
  /** Accessible name of the close button (from i18n). */
  closeLabel?: string
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  variant = 'default',
  dismissible = true,
  closeLabel = 'Close',
}: DialogProps) {
  const Parts = variant === 'alert' ? AlertDialog : BaseDialog
  const showClose = variant !== 'alert' && dismissible

  // There is no trigger inside: Base UI only ever asks to close.
  return (
    <Parts.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Parts.Portal>
        <Parts.Backdrop className="fixed inset-0 bg-surface-scrim" />
        <Parts.Popup className="fixed top-1/2 left-1/2 flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-overlay bg-surface-overlay p-6 text-text-default shadow-lg outline-none">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Parts.Title className="heading-4">{title}</Parts.Title>
              {description && (
                <Parts.Description className="text-base text-text-subdued">{description}</Parts.Description>
              )}
            </div>
            {showClose && (
              <Parts.Close
                aria-label={closeLabel}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-icon-default hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-border-focus"
              >
                <CloseIcon />
              </Parts.Close>
            )}
          </div>
          {children}
          {actions && <div className="flex flex-wrap justify-end gap-3">{actions}</div>}
        </Parts.Popup>
      </Parts.Portal>
    </Parts.Root>
  )
}
