import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { SpinnerIcon } from '../icons'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes'

export type { ButtonSize, ButtonVariant } from './button-classes'

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner, sets aria-busy and blocks activation. */
  loading?: boolean
  iconStart?: ReactNode
  iconEnd?: ReactNode
  /** Qi "tertiary with underline": the lowest-emphasis, link-like action. */
  underline?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  iconStart,
  iconEnd,
  underline = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      data-size={size}
      className={cn(buttonClasses(variant, size), underline && 'underline underline-offset-4', className)}
      {...rest}
    >
      {loading ? <SpinnerIcon /> : iconStart}
      {children}
      {iconEnd}
    </button>
  )
}
