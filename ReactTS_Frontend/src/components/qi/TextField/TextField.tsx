import { Field } from '@base-ui/react/field'
import type { ComponentProps } from 'react'
import { cn } from '../../../lib/cn'
import { ErrorIcon } from '../icons'

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'size'> {
  label: string
  /** Qi: mark whichever of required/optional is fewer on the page, e.g. "(optional)". */
  labelSuffix?: string
  /** Guidance shown under the field and announced with it. Not a substitute for the label. */
  hint?: string
  /** Error message; when set the field is marked invalid. */
  error?: string
}

export function TextField({
  label,
  labelSuffix,
  hint,
  error,
  disabled,
  className,
  ...inputProps
}: TextFieldProps) {
  return (
    <Field.Root invalid={Boolean(error)} disabled={disabled} className="flex flex-col gap-1">
      <Field.Label className="text-sm font-semibold text-text-default data-disabled:text-text-disabled">
        {label}
        {labelSuffix && <> <span className="font-normal text-text-subdued">{labelSuffix}</span></>}
      </Field.Label>
      <Field.Control
        {...inputProps}
        className={cn(
          'min-h-12 rounded-form border border-border-default bg-surface-enabled-1 px-3 text-base text-text-default',
          'placeholder:text-text-subdued hover:border-border-selected',
          'focus:outline-2 focus:-outline-offset-1 focus:outline-border-focus',
          'data-invalid:border-border-error',
          'data-disabled:cursor-not-allowed data-disabled:border-border-disabled data-disabled:bg-surface-disabled-1 data-disabled:text-text-disabled',
          className,
        )}
      />
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
