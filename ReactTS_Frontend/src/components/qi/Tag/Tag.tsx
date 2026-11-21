import type { ComponentProps } from 'react'
import { cn } from '../../../lib/cn'

export type TagEmphasis = 'default' | 'medium' | 'high' | 'new'

export interface TagProps extends ComponentProps<'span'> {
  emphasis?: TagEmphasis
}

const EMPHASIS_CLASSES: Record<TagEmphasis, string> = {
  default: 'bg-tag-default-surface text-tag-default-text',
  medium: 'bg-tag-mediumemphasis-surface text-tag-mediumemphasis-text',
  high: 'bg-tag-highemphasis-surface text-tag-highemphasis-text',
  new: 'bg-tag-new-surface text-tag-new-text',
}

/**
 * Qi tag: a non-interactive label for an attribute (e.g. "Vendor", "System role").
 * Not for statuses (use StatusIndicator) and never with icons.
 */
export function Tag({ emphasis = 'default', className, ...rest }: TagProps) {
  return (
    <span
      data-emphasis={emphasis}
      className={cn('inline-flex w-fit items-center rounded-tag px-2 py-0.5 text-xs font-semibold', EMPHASIS_CLASSES[emphasis], className)}
      {...rest}
    />
  )
}
