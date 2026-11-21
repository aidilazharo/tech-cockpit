import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '../icons'

/**
 * Qi semantic statuses: positive (green: active, approved), attention (yellow: needs
 * action), negative (cerise: declined, error), informative (blue: in progress),
 * ended (charcoal: terminated, ended, unavailable).
 */
export type StatusTone = 'positive' | 'attention' | 'negative' | 'informative' | 'ended'

const TONES: Record<StatusTone, { icon: (props: { className?: string }) => ReactNode; className: string }> = {
  positive: { icon: SuccessIcon, className: 'text-icon-success' },
  attention: { icon: WarningIcon, className: 'text-icon-warning' },
  negative: { icon: ErrorIcon, className: 'text-icon-error' },
  informative: { icon: InfoIcon, className: 'text-icon-informative' },
  ended: { icon: EndedIcon, className: 'text-icon-default' },
}

function EndedIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false" className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.25 8h5.5" strokeLinecap="round" />
    </svg>
  )
}

/** Qi status indicator: icon + short text label (never icon alone), read-only. */
export function StatusIndicator({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = TONES[tone]
  return (
    <span data-tone={tone} className={cn('inline-flex items-center gap-1.5 text-sm text-text-default', className)}>
      <Icon className={cn('size-4 shrink-0', toneClass)} />
      <span>{children}</span>
    </span>
  )
}
