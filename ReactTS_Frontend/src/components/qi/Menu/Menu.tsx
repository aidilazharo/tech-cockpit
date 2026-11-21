import { Menu as BaseMenu } from '@base-ui/react/menu'
import { useId, type ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { CheckIcon } from '../icons'

export interface MenuProps {
  /** Accessible name of the trigger. It must contain any visible text on the trigger (WCAG 2.5.3), e.g. "TA account menu for Test Admin" for an avatar showing "TA". */
  label: string
  /** Visible trigger content (avatar, icon, text). */
  trigger: ReactNode
  /** Popup alignment to the trigger. */
  align?: 'start' | 'center' | 'end'
  children: ReactNode
  className?: string
}

const ITEM_CLASSES = cn(
  'flex min-h-10 cursor-default items-center gap-2 px-3 text-base outline-none select-none',
  'data-highlighted:bg-surface-hover-1',
  'data-disabled:cursor-not-allowed data-disabled:text-text-disabled',
)

/**
 * Menu of actions opened from a trigger. Qi has no menu component; this follows the
 * Qi dropdown list styling (overlay surface, 8 px radius, 40 px rows) and Base UI's
 * menu keyboard behaviour (arrows, Home/End, typeahead, Escape returns focus).
 */
export function Menu({ label, trigger, align = 'end', children, className }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label={label}
        className={cn(
          'inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-button px-1 text-text-default',
          'hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          'data-popup-open:bg-surface-hover-1',
          className,
        )}
      >
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="z-50 outline-none" sideOffset={4} align={align}>
          <BaseMenu.Popup className="max-h-(--available-height) min-w-56 overflow-y-auto rounded-form border border-border-subdued bg-surface-overlay py-1 text-text-default shadow-md outline-none">
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export interface MenuItemProps {
  onClick?: () => void
  disabled?: boolean
  icon?: ReactNode
  children: ReactNode
}

export function MenuItem({ onClick, disabled, icon, children }: MenuItemProps) {
  return (
    <BaseMenu.Item onClick={onClick} disabled={disabled} className={ITEM_CLASSES}>
      {icon && <span className="shrink-0 text-icon-default">{icon}</span>}
      {children}
    </BaseMenu.Item>
  )
}

export function MenuSeparator() {
  return <BaseMenu.Separator className="my-1 h-px bg-divider-default" />
}

/** Non-interactive content, such as who is signed in. */
export function MenuSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 px-3 py-2">{children}</div>
}

export interface MenuRadioGroupProps<V extends string> {
  label: string
  value: V
  onValueChange: (value: V) => void
  options: { value: V; label: string }[]
}

/** One choice among options, kept open so the effect (e.g. a theme) is visible. */
export function MenuRadioGroup<V extends string>({ label, value, onValueChange, options }: MenuRadioGroupProps<V>) {
  const labelId = useId()
  return (
    <BaseMenu.Group aria-labelledby={labelId}>
      <BaseMenu.GroupLabel id={labelId} className="px-3 pt-1 pb-1 text-sm font-semibold text-text-subdued">
        {label}
      </BaseMenu.GroupLabel>
      <BaseMenu.RadioGroup value={value} onValueChange={(next: V) => onValueChange(next)}>
        {options.map((option) => (
          <BaseMenu.RadioItem
            key={option.value}
            value={option.value}
            closeOnClick={false}
            className={cn(ITEM_CLASSES, 'grid grid-cols-[1rem_1fr] data-checked:font-semibold')}
          >
            <BaseMenu.RadioItemIndicator className="col-start-1 text-icon-selected">
              <CheckIcon />
            </BaseMenu.RadioItemIndicator>
            <span className="col-start-2">{option.label}</span>
          </BaseMenu.RadioItem>
        ))}
      </BaseMenu.RadioGroup>
    </BaseMenu.Group>
  )
}
