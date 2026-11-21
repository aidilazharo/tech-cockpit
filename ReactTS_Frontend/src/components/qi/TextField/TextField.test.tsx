import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('associates the label with the input', () => {
    render(<TextField label="Project name" />)
    expect(screen.getByRole('textbox', { name: 'Project name' })).toBeInTheDocument()
  })

  it('shows a label suffix such as "(optional)"', () => {
    render(<TextField label="Remarks" labelSuffix="(optional)" />)
    expect(screen.getByText('(optional)')).toBeInTheDocument()
  })

  it('links the hint text to the input for screen readers', () => {
    render(<TextField label="Cost centre" hint="Format: CC-0000" />)
    const input = screen.getByRole('textbox', { name: 'Cost centre' })
    const hint = screen.getByText('Format: CC-0000')
    expect(input.getAttribute('aria-describedby')).toContain(hint.id)
  })

  it('marks the input invalid and announces the error message', () => {
    render(<TextField label="Amount" error="Enter an amount in RM" />)
    const input = screen.getByRole('textbox', { name: 'Amount' })
    const error = screen.getByText('Enter an amount in RM')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
  })

  it('is not marked invalid without an error', () => {
    render(<TextField label="Amount" />)
    expect(screen.getByRole('textbox', { name: 'Amount' })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('accepts typing and reports changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextField label="Title" onChange={onChange} />)

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'TRM')

    expect(onChange).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('TRM')
  })

  it('does not accept input when disabled', async () => {
    const user = userEvent.setup()
    render(<TextField label="Title" disabled />)
    const input = screen.getByRole('textbox', { name: 'Title' })

    await user.type(input, 'x')

    expect(input).toBeDisabled()
    expect(input).toHaveValue('')
  })
})
