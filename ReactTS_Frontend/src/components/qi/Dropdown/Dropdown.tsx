import { Field } from '@base-ui/react/field'
import { Select } from '@base-ui/react/select'
import { cn } from '../../../lib/cn'
import { CheckIcon, ChevronDownIcon, ErrorIcon } from '../icons'

export interface DropdownOption<V extends string> {
  value: V
  label: string
  disabled?: boolean
}

export interface DropdownProps<V extends string> {
  label: string
  /** Hides the label from view; it stays the accessible name (for a dropdown in a table row, named by its row). */
  hideLabel?: boolean
  options: DropdownOption<V>[]
  value?: V | null
  defaultValue?: V | null
  /** Called with the option chosen (there is no empty option, so never null). */
  onValueChange?: (value: V) => void
  placeholder?: string
  hint?: string
  error?: string
  disabled?: boolean
  required?: boolean
  name?: string
  className?: string
}

/** Qi simple dropdown: one choice from a list. (Search and multi-select variants come later.) */
export function Dropdown<V extends string>({
  label,
  hideLabel,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  hint,
  error,
  disabled,
  required,
  name,
  className,
}: DropdownProps<V>) {
  return (
    <Field.Root invalid={Boolean(error)} disabled={disabled} name={name} className={cn('flex flex-col gap-1', className)}>
      <Select.Root<V>
        items={options}
        value={value}
        defaultValue={defaultValue}
        // Base UI reports a value only when an item is chosen, and every item has one.
        onValueChange={(next) => onValueChange?.(next as V)}
        disabled={disabled}
        required={required}
      >
        <Select.Label className={cn('text-sm font-semibold text-text-default data-disabled:text-text-disabled', hideLabel && 'sr-only')}>
          {label}
        </Select.Label>
        <Select.Trigger
          className={cn(
            'flex min-h-12 items-center justify-between gap-3 rounded-form border border-border-default bg-surface-enabled-1 px-3 text-left text-base text-text-default',
            'hover:not-data-disabled:border-border-selected focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-border-focus',
            'data-invalid:border-border-error',
            'data-disabled:cursor-not-allowed data-disabled:border-border-disabled data-disabled:bg-surface-disabled-1 data-disabled:text-text-disabled',
          )}
        >
          <Select.Value className="data-placeholder:text-text-subdued" placeholder={placeholder} />
          <Select.Icon className="text-icon-default">
            <ChevronDownIcon />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="z-50 outline-none" sideOffset={4} alignItemWithTrigger={false}>
            <Select.Popup className="min-w-(--anchor-width) rounded-form border border-border-subdued bg-surface-overlay py-1 text-text-default shadow-md outline-none">
              <Select.List className="max-h-(--available-height) overflow-y-auto">
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={cn(
                      'grid min-h-10 cursor-default grid-cols-[1rem_1fr] items-center gap-2 px-3 text-base outline-none select-none',
                      'data-highlighted:bg-surface-hover-1 data-selected:font-semibold',
                      'data-disabled:cursor-not-allowed data-disabled:text-text-disabled',
                    )}
                  >
                    <Select.ItemIndicator className="col-start-1 text-icon-selected">
                      <CheckIcon />
                    </Select.ItemIndicator>
                    <Select.ItemText className="col-start-2">{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      {hint && <Field.Description className="text-sm text-text-subdued">{hint}</Field.Description>}
      {error && (
        <Field.Error match className="flex items-center gap-1 text-sm text-text-error">
          <ErrorIcon className="shrink-0" />
          {error}
        </Field.Error>
      )}
    </Field.Root>
  )
}
