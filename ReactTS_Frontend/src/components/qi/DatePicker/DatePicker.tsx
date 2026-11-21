import { Field } from '@base-ui/react/field'
import { Popover } from '@base-ui/react/popover'
import { useRef, useState } from 'react'
import { DayPicker, type DateLib, type Modifiers } from 'react-day-picker'
import { cn } from '../../../lib/cn'
import {
  fromCalendarDate,
  maskDisplayDate,
  parseDisplayDate,
  toCalendarDate,
  toDisplayDate,
  todayMy,
} from '../../../lib/dates'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ErrorIcon } from '../icons'

export interface DatePickerLabels {
  /** Accessible name of the calendar button */
  openCalendar: string
  previousMonth: string
  nextMonth: string
  /** Shown when the typed text is not a date */
  invalid: string
  /** Shown for a date before `min`; {{date}} is replaced with DD/MM/YYYY */
  tooEarly: string
  /** Shown for a date after `max`; {{date}} is replaced with DD/MM/YYYY */
  tooLate: string
}

export interface DatePickerProps {
  label: string
  /** 'YYYY-MM-DD' or null */
  value: string | null
  onChange: (value: string | null) => void
  labels: DatePickerLabels
  /** Earliest allowed date, 'YYYY-MM-DD' (Qi: disable illogical dates) */
  min?: string
  /** Latest allowed date, 'YYYY-MM-DD' */
  max?: string
  labelSuffix?: string
  hint?: string
  /** Error from the form (e.g. required, end before start). A problem with the typed text is shown first. */
  error?: string
  disabled?: boolean
  name?: string
}

const DISPLAY_LENGTH = 'DD/MM/YYYY'.length

const DAY_BUTTON = cn(
  'size-10 rounded-button text-sm text-text-default',
  'hover:enabled:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus',
  'disabled:cursor-not-allowed disabled:text-text-disabled',
)

/**
 * "Wednesday, 21 October 2026". The library's default ("October 21st, 2026") spells the day as "21st", so a
 * button showing "21" does not have its visible text in its name (WCAG 2.5.3 Label in Name).
 */
function dayButtonName(date: Date, modifiers: Modifiers, dateLib: DateLib): string {
  const name = dateLib.format(date, 'EEEE, d MMMM yyyy')
  const named = modifiers.today ? `Today, ${name}` : name
  return modifiers.selected ? `${named}, selected` : named
}

/**
 * Qi calendar picker: type DD/MM/YYYY (digits only is fine) or choose from the
 * calendar. Keyboard: the calendar grid supports arrows, Page Up/Down and Home/End.
 */
export function DatePicker({ label, value, onChange, labels, min, max, labelSuffix, hint, error, disabled, name }: DatePickerProps) {
  const [text, setText] = useState(value ? toDisplayDate(value) : '')
  const [shown, setShown] = useState(value)
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // Follow a value set from outside (form reset, another field).
  if (value !== shown) {
    setShown(value)
    setText(value ? toDisplayDate(value) : '')
    setProblem(null)
  }

  const check = (iso: string): string | null => {
    if (min && iso < min) return labels.tooEarly.replace('{{date}}', toDisplayDate(min))
    if (max && iso > max) return labels.tooLate.replace('{{date}}', toDisplayDate(max))
    return null
  }

  const accept = (iso: string | null) => {
    setShown(iso)
    onChange(iso)
  }

  const typed = (raw: string) => {
    const masked = maskDisplayDate(raw)
    setText(masked)
    if (masked === '') {
      setProblem(null)
      accept(null)
      return
    }
    if (masked.length < DISPLAY_LENGTH) {
      setProblem(null)
      return
    }
    const iso = parseDisplayDate(masked)
    const issue = iso ? check(iso) : labels.invalid
    setProblem(issue)
    accept(issue ? null : iso)
  }

  const picked = (date: Date | undefined) => {
    if (!date) return
    const iso = fromCalendarDate(date)
    setText(toDisplayDate(iso))
    setProblem(null)
    accept(iso)
    setOpen(false)
    input.current?.focus()
  }

  const message = problem ?? error ?? undefined
  const month = value ?? min ?? todayMy()

  return (
    <Field.Root invalid={Boolean(message)} disabled={disabled} name={name} className="flex flex-col gap-1">
      <Field.Label className="text-sm font-semibold text-text-default data-disabled:text-text-disabled">
        {label}
        {labelSuffix && <> <span className="font-normal text-text-subdued">{labelSuffix}</span></>}
      </Field.Label>
      <div className="relative">
        <Field.Control
          ref={input}
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD/MM/YYYY"
          value={text}
          onChange={(event) => typed(event.target.value)}
          onBlur={() => {
            if (text && text.length < DISPLAY_LENGTH) setProblem(labels.invalid)
          }}
          className={cn(
            'min-h-12 w-full rounded-form border border-border-default bg-surface-enabled-1 pr-12 pl-3 text-base text-text-default',
            'placeholder:text-text-subdued hover:border-border-selected',
            'focus:outline-2 focus:-outline-offset-1 focus:outline-border-focus',
            'data-invalid:border-border-error',
            'data-disabled:cursor-not-allowed data-disabled:border-border-disabled data-disabled:bg-surface-disabled-1 data-disabled:text-text-disabled',
          )}
        />
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            disabled={disabled}
            aria-label={labels.openCalendar}
            className={cn(
              'absolute top-1 right-1 inline-flex size-10 items-center justify-center rounded-button text-icon-default',
              'hover:enabled:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-border-focus',
              'disabled:cursor-not-allowed disabled:text-icon-disabled',
            )}
          >
            <CalendarIcon className="size-5" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="z-50 outline-none" sideOffset={4} align="end">
              <Popover.Popup
                aria-label={label}
                className="rounded-overlay border border-border-subdued bg-surface-overlay p-3 text-text-default shadow-md outline-none"
              >
                <DayPicker
                  mode="single"
                  selected={value ? toCalendarDate(value) : undefined}
                  onSelect={picked}
                  defaultMonth={toCalendarDate(month)}
                  weekStartsOn={1}
                  disabled={[...(min ? [{ before: toCalendarDate(min) }] : []), ...(max ? [{ after: toCalendarDate(max) }] : [])]}
                  labels={{
                    labelPrevious: () => labels.previousMonth,
                    labelNext: () => labels.nextMonth,
                    labelDayButton: (date, modifiers, _options, dateLib) => dayButtonName(date, modifiers, dateLib!),
                  }}
                  components={{
                    Chevron: ({ orientation }) =>
                      orientation === 'left' ? <ChevronLeftIcon className="size-4" /> : <ChevronRightIcon className="size-4" />,
                  }}
                  classNames={{
                    root: 'relative',
                    months: 'flex flex-col',
                    month: 'flex flex-col gap-2',
                    month_caption: 'flex h-10 items-center justify-center font-semibold',
                    nav: 'absolute inset-x-0 top-0 flex justify-between',
                    button_previous: DAY_BUTTON + ' inline-flex items-center justify-center',
                    button_next: DAY_BUTTON + ' inline-flex items-center justify-center',
                    month_grid: 'border-collapse',
                    weekdays: '',
                    weekday: 'size-10 text-xs font-semibold text-text-subdued',
                    week: '',
                    day: 'p-0 text-center',
                    day_button: DAY_BUTTON,
                    selected: '[&>button]:bg-button-primary-surface [&>button]:font-semibold [&>button]:text-button-primary-text',
                    today: '[&>button]:underline [&>button]:underline-offset-4',
                    outside: '[&>button]:text-text-subdued',
                    disabled: '[&>button]:text-text-disabled',
                    hidden: 'invisible',
                  }}
                />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {hint && <Field.Description className="text-sm text-text-subdued">{hint}</Field.Description>}
      {message && (
        <Field.Error match className="flex items-center gap-1 text-sm text-text-error">
          <ErrorIcon className="shrink-0" />
          {message}
        </Field.Error>
      )}
    </Field.Root>
  )
}
