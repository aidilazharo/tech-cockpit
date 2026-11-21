import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dropdown } from './Dropdown'

const portfolios = [
  { value: 'digital', label: 'Digital' },
  { value: 'core', label: 'Core Insurance' },
  { value: 'legacy', label: 'Legacy', disabled: true },
]

describe('Dropdown', () => {
  it('renders a labelled combobox with a placeholder', () => {
    render(<Dropdown label="Portfolio" options={portfolios} placeholder="Select a portfolio" />)
    const trigger = screen.getByRole('combobox', { name: 'Portfolio' })
    expect(trigger).toHaveTextContent('Select a portfolio')
  })

  it('can hide its label from view while keeping it as the accessible name (e.g. in a table row)', () => {
    render(<Dropdown label="Becomes: Billing" hideLabel options={portfolios} placeholder="Choose" />)
    expect(screen.getByRole('combobox', { name: 'Becomes: Billing' })).toBeInTheDocument()
    expect(screen.getByText('Becomes: Billing')).toHaveClass('sr-only')
  })

  it('selects an option with the mouse and reports the value', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Dropdown label="Portfolio" options={portfolios} onValueChange={onValueChange} />)

    await user.click(screen.getByRole('combobox', { name: 'Portfolio' }))
    await user.click(await screen.findByRole('option', { name: 'Core Insurance' }))

    expect(onValueChange).toHaveBeenCalledWith('core')
    expect(screen.getByRole('combobox', { name: 'Portfolio' })).toHaveTextContent('Core Insurance')
  })

  it('shows the label of a controlled value', () => {
    render(<Dropdown label="Portfolio" options={portfolios} value="digital" onValueChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: 'Portfolio' })).toHaveTextContent('Digital')
  })

  it('does not select a disabled option', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Dropdown label="Portfolio" options={portfolios} onValueChange={onValueChange} />)

    await user.click(screen.getByRole('combobox', { name: 'Portfolio' }))
    const legacy = await screen.findByRole('option', { name: 'Legacy' })
    expect(legacy).toHaveAttribute('aria-disabled', 'true')
    await user.click(legacy)

    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('shows the hint and the error message', () => {
    render(
      <Dropdown
        label="Portfolio"
        options={portfolios}
        hint="Choose where the project belongs"
        error="Select a portfolio"
      />,
    )
    expect(screen.getByText('Choose where the project belongs')).toBeInTheDocument()
    expect(screen.getByText('Select a portfolio')).toBeInTheDocument()
  })

  it('cannot be opened when disabled', async () => {
    const user = userEvent.setup()
    render(<Dropdown label="Portfolio" options={portfolios} disabled />)

    await user.click(screen.getByRole('combobox', { name: 'Portfolio' }))

    expect(screen.queryByRole('option', { name: 'Digital' })).not.toBeInTheDocument()
  })
})
