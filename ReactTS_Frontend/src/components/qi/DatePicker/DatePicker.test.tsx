import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DatePicker, type DatePickerProps } from './DatePicker'

const labels = {
  openCalendar: 'Choose date',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  invalid: 'Enter a date as DD/MM/YYYY',
  tooEarly: 'Choose a date on or after {{date}}',
  tooLate: 'Choose a date on or before {{date}}',
}

function Harness({ initial = null, onChange = () => {}, ...props }: Partial<DatePickerProps> & { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <>
      <DatePicker
        label="Start date"
        labels={labels}
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
        {...props}
      />
      <p>Value: {value ?? 'none'}</p>
    </>
  )
}

describe('DatePicker', () => {
  it('shows the value as DD/MM/YYYY in a labelled field', () => {
    render(<Harness initial="2026-10-21" hint="When the role starts" />)

    const input = screen.getByRole('textbox', { name: 'Start date' })
    expect(input).toHaveValue('21/10/2026')
    expect(input).toHaveAttribute('placeholder', 'DD/MM/YYYY')
    expect(input).toHaveAccessibleDescription('When the role starts')
  })

  it('accepts typed digits without separators (input mask)', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Start date' }), '05012027')

    expect(screen.getByRole('textbox')).toHaveValue('05/01/2027')
    expect(onChange).toHaveBeenLastCalledWith('2027-01-05')
  })

  it('explains an impossible date when leaving the field', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Start date' }), '31022027')
    await userEvent.tab()

    expect(screen.getByText('Enter a date as DD/MM/YYYY')).toBeInTheDocument()
    expect(screen.getByText('Value: none')).toBeInTheDocument()
  })

  it('explains a date typed only in part when leaving the field', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Start date' }), '3102')
    await userEvent.tab()

    expect(screen.getByText('Enter a date as DD/MM/YYYY')).toBeInTheDocument()
  })

  it('refuses dates outside the allowed range (Qi: disable illogical dates)', async () => {
    render(<Harness min="2026-10-21" max="2026-12-31" />)
    const input = screen.getByRole('textbox', { name: 'Start date' })

    await userEvent.type(input, '20102026')
    expect(screen.getByText('Choose a date on or after 21/10/2026')).toBeInTheDocument()
    await userEvent.clear(input)
    await userEvent.type(input, '01012027')
    expect(screen.getByText('Choose a date on or before 31/12/2026')).toBeInTheDocument()
    expect(screen.getByText('Value: none')).toBeInTheDocument()
  })

  it('clears the value when the text is removed', async () => {
    render(<Harness initial="2026-10-21" />)

    await userEvent.clear(screen.getByRole('textbox', { name: 'Start date' }))

    expect(screen.getByText('Value: none')).toBeInTheDocument()
  })

  it('picks a date from the calendar and returns focus to the field', async () => {
    render(<Harness initial="2026-10-21" />)

    await userEvent.click(screen.getByRole('button', { name: 'Choose date' }))
    const calendar = await screen.findByRole('dialog')
    expect(within(calendar).getByRole('grid', { name: 'October 2026' })).toBeInTheDocument()
    await userEvent.click(within(calendar).getByRole('button', { name: 'Sunday, 25 October 2026' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Value: 2026-10-25')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('25/10/2026')
  })

  it('names each day button with its day number as a whole word, and says which is today and which is selected', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-22T04:00:00Z') })
    try {
      render(<Harness initial="2026-10-21" />)

      await userEvent.click(screen.getByRole('button', { name: 'Choose date' }))
      const calendar = await screen.findByRole('dialog')
      expect(within(calendar).getByRole('button', { name: 'Wednesday, 21 October 2026, selected' })).toHaveTextContent(/^21$/)
      expect(within(calendar).getByRole('button', { name: 'Today, Thursday, 22 October 2026' })).toHaveTextContent(/^22$/)
      for (const day of within(calendar).getAllByRole('button', { name: /\d{4}/ })) {
        expect(day.getAttribute('aria-label')).toMatch(new RegExp(`(^|\\s)${day.textContent}(\\s|$)`))
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves between months and disables days outside the range', async () => {
    render(<Harness min="2026-10-15" />)

    await userEvent.click(screen.getByRole('button', { name: 'Choose date' }))
    const calendar = await screen.findByRole('dialog')
    expect(within(calendar).getByRole('button', { name: 'Wednesday, 14 October 2026' })).toBeDisabled()
    await userEvent.click(within(calendar).getByRole('button', { name: 'Next month' }))
    expect(within(calendar).getByRole('grid', { name: 'November 2026' })).toBeInTheDocument()
  })

  it('explains a typed date before the form error', async () => {
    render(<Harness min="2026-10-21" error="Choose the last day" />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Start date' }), '01012026')

    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Choose a date on or after 21/10/2026')
  })

  it('shows an error given by the form', () => {
    render(<Harness error="The end date must be after the start date" />)

    expect(screen.getByRole('textbox', { name: 'Start date' })).toHaveAccessibleDescription('The end date must be after the start date')
  })

  it('can be disabled', () => {
    render(<Harness disabled initial="2026-10-21" />)

    expect(screen.getByRole('textbox', { name: 'Start date' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Choose date' })).toBeDisabled()
  })
})
