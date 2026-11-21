import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { useId } from 'react'
import { cn } from '../../../lib/cn'
import { CheckIcon } from '../icons'

export interface CheckboxProps {
  label: string
  /** Extra detail under the label, announced with the checkbox. */
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  name?: string
  className?: string
}

/** Qi checkbox (without container): one of several independent options. */
export function Checkbox({ label, description, checked, onCheckedChange, disabled, name, className }: CheckboxProps) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <label className={cn('flex items-start gap-3 py-1', disabled ? 'cursor-not-allowed' : 'cursor-pointer', className)}>
      <BaseCheckbox.Root
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        name={name}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-checkbox border border-border-default bg-surface-enabled-1 text-text-inverse',
          'data-checked:border-border-selected data-checked:bg-icon-selected',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          'data-disabled:border-border-disabled data-disabled:bg-surface-disabled-1',
        )}
      >
        <BaseCheckbox.Indicator>
          <CheckIcon className="size-4" />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span className="flex flex-col">
        <span id={labelId} className={cn('text-base', disabled ? 'text-text-disabled' : 'text-text-default')}>
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="text-sm text-text-subdued">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}
