import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '../icons'

export type PageMessageVariant = 'informative' | 'success' | 'warning' | 'error'

export interface PageMessageProps extends Omit<ComponentProps<'div'>, 'title'> {
  /** Pick by meaning, never for attention (Qi): error only for errors. */
  variant?: PageMessageVariant
  title?: ReactNode
  /** At most one call to action (Qi). Use a primary or tertiary Button: the secondary outline fails contrast on the error surface. */
  action?: ReactNode
}

const VARIANT_CLASSES: Record<PageMessageVariant, { box: string; icon: string }> = {
  informative: {
    box: 'border-page-level-message-informative-border bg-page-level-message-informative-surface',
    icon: 'text-icon-informative',
  },
  success: {
    box: 'border-page-level-message-success-border bg-page-level-message-success-surface',
    icon: 'text-icon-success',
  },
  warning: {
    box: 'border-page-level-message-warning-border bg-page-level-message-warning-surface',
    icon: 'text-icon-warning',
  },
  error: {
    box: 'border-page-level-message-error-border bg-page-level-message-error-surface',
    icon: 'text-icon-error',
  },
}

const ICONS = { informative: InfoIcon, success: SuccessIcon, warning: WarningIcon, error: ErrorIcon }

/**
 * Qi page-level message: important, contextual information that stays until the
 * user acts. Errors and warnings are announced immediately (role="alert").
 */
export function PageMessage({ variant = 'informative', title, action, className, children, ...rest }: PageMessageProps) {
  const titleId = useId()
  const Icon = ICONS[variant]
  const urgent = variant === 'error' || variant === 'warning'

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      aria-labelledby={title ? titleId : undefined}
      data-variant={variant}
      className={cn('flex gap-3 rounded-card border p-4 text-text-default', VARIANT_CLASSES[variant].box, className)}
      {...rest}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', VARIANT_CLASSES[variant].icon)} />
      <div className="flex flex-col gap-2">
        {title && (
          <p id={titleId} className="font-semibold">
            {title}
          </p>
        )}
        <div className="text-sm">{children}</div>
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  )
}
