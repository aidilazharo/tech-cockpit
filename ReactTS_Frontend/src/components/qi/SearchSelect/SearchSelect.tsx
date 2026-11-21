import { Combobox } from '@base-ui/react/combobox'
import { Field } from '@base-ui/react/field'
import type { ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { CheckIcon, ErrorIcon } from '../icons'

export interface SearchSelectProps<T> {
  label: string
  /** Current choice, or null */
  value: T | null
  onValueChange: (value: T | null) => void
  /** Options matching the current search (filtered by the caller, e.g. on the server) */
  items: T[]
  /** Called as the user types */
  onQueryChange: (query: string) => void
  itemKey: (item: T) => string
  itemLabel: (item: T) => string
  /** Second line under an option, e.g. an email */
  itemDescription?: (item: T) => ReactNode
  placeholder?: string
  /** Shown when nothing matches (or before typing) */
  emptyText: string
  hint?: string
  error?: string
  disabled?: boolean
}

/** Qi dropdown with search: type to find one option among many (people, applications). */
export function SearchSelect<T>({
  label,
  value,
  onValueChange,
  items,
  onQueryChange,
  itemKey,
  itemLabel,
  itemDescription,
  placeholder,
  emptyText,
  hint,
  error,
  disabled,
}: SearchSelectProps<T>) {
  return (
    <Field.Root invalid={Boolean(error)} disabled={disabled} className="flex flex-col gap-1">
      <Combobox.Root<T>
        items={items}
        filter={null}
        value={value}
        onValueChange={(next) => onValueChange((next as T | null) ?? null)}
        onInputValueChange={(query) => onQueryChange(query)}
        itemToStringLabel={itemLabel}
        isItemEqualToValue={(a, b) => itemKey(a) === itemKey(b)}
        disabled={disabled}
      >
        <Field.Label className="text-sm font-semibold text-text-default data-disabled:text-text-disabled">{label}</Field.Label>
        <Combobox.Input
          placeholder={placeholder}
          className={cn(
            'min-h-12 rounded-form border border-border-default bg-surface-enabled-1 px-3 text-base text-text-default',
            'placeholder:text-text-subdued hover:border-border-selected',
            'focus:outline-2 focus:-outline-offset-1 focus:outline-border-focus',
            'data-invalid:border-border-error',
            'data-disabled:cursor-not-allowed data-disabled:border-border-disabled data-disabled:bg-surface-disabled-1 data-disabled:text-text-disabled',
          )}
        />
        <Combobox.Portal>
          <Combobox.Positioner className="z-50 outline-none" sideOffset={4}>
            <Combobox.Popup className="max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto rounded-form border border-border-subdued bg-surface-overlay py-1 text-text-default shadow-md outline-none">
              <Combobox.Empty className="px-3 py-2 text-sm text-text-subdued empty:hidden">{emptyText}</Combobox.Empty>
              <Combobox.List>
                {(item: T) => (
                  <Combobox.Item
                    key={itemKey(item)}
                    value={item}
                    className={cn(
                      'grid min-h-10 cursor-default grid-cols-[1rem_1fr] items-center gap-2 px-3 py-1 outline-none select-none',
                      'data-highlighted:bg-surface-hover-1 data-selected:font-semibold',
                    )}
                  >
                    <Combobox.ItemIndicator className="col-start-1 text-icon-selected">
                      <CheckIcon />
                    </Combobox.ItemIndicator>
                    <span className="col-start-2 flex flex-col">
                      <span>{itemLabel(item)}</span>
                      {itemDescription && <span className="text-sm font-normal text-text-subdued">{itemDescription(item)}</span>}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
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
