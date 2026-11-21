import { Avatar as BaseAvatar } from '@base-ui/react/avatar'
import type { ComponentProps } from 'react'
import { cn } from '../../../lib/cn'
import { initialsOf } from './initials'

export type AvatarSize = 'sm' | 'md' | 'lg'
export type AvatarTone = 'secondary-1' | 'secondary-2' | 'secondary-3'

export interface AvatarProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** Person or entity shown; used for the initials and the accessible name. */
  name: string
  /** Photo (Qi: prefer an image when available). Initials show until it loads. */
  src?: string
  size?: AvatarSize
  tone?: AvatarTone
  /** Hide from assistive technology when the surrounding control already names it. */
  decorative?: boolean
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'size-6 text-xs',
  md: 'size-8 text-sm',
  lg: 'size-12 text-lg',
}

const TONE_CLASSES: Record<AvatarTone, string> = {
  'secondary-1': 'bg-avatar-secondary-1-surface text-avatar-secondary-1-text',
  'secondary-2': 'bg-avatar-secondary-2-surface text-avatar-secondary-2-text',
  'secondary-3': 'bg-avatar-secondary-3-surface text-avatar-secondary-3-text',
}

/** Qi avatar: a 1:1 picture or initials representing a person. */
export function Avatar({ name, src, size = 'md', tone = 'secondary-1', decorative = false, className, ...rest }: AvatarProps) {
  return (
    <BaseAvatar.Root
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      data-size={size}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {src && <BaseAvatar.Image src={src} alt="" className="size-full object-cover" />}
      <BaseAvatar.Fallback>{initialsOf(name)}</BaseAvatar.Fallback>
    </BaseAvatar.Root>
  )
}
