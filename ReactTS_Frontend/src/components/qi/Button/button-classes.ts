import { cn } from '../../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary'
export type ButtonSize = 'md' | 'lg'

// Qi: primary = digital red (max 20% of a layout), secondary = red outline,
// tertiary = charcoal text for supplementary actions.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-button-primary-border bg-button-primary-surface text-button-primary-text hover:enabled:border-button-primary-border-hover hover:enabled:bg-button-primary-surface-hover disabled:border-border-disabled disabled:bg-surface-disabled-1 disabled:text-text-disabled',
  secondary:
    'border-button-secondary-border bg-button-secondary-surface text-button-secondary-text hover:enabled:bg-button-secondary-surface-hover disabled:border-border-disabled disabled:text-text-disabled',
  tertiary:
    'border-transparent bg-transparent text-button-tertiary-text hover:enabled:bg-surface-hover-1 disabled:text-text-disabled',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-10 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
}

/**
 * Qi button styling, shared by Button and ButtonLink. Links have no :enabled state,
 * so their hover styles apply directly.
 */
export function buttonClasses(variant: ButtonVariant, size: ButtonSize, element: 'button' | 'link' = 'button'): string {
  const variantClasses = element === 'link' ? VARIANT_CLASSES[variant].replaceAll('hover:enabled:', 'hover:') : VARIANT_CLASSES[variant]
  return cn(
    'inline-flex min-w-10 items-center justify-center gap-2 rounded-button border font-semibold transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed',
    variantClasses,
    SIZE_CLASSES[size],
  )
}
