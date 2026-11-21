import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DesignSystemPage } from './DesignSystemPage'

describe('DesignSystemPage', () => {
  it('has one h1, landmarks and a section per component group', () => {
    render(<DesignSystemPage />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Qi design system' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    for (const name of ['Buttons', 'Form fields', 'Dialogs', 'Tables']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('shows MYR amounts and "Restricted" for financial values the user may not see', () => {
    render(<DesignSystemPage />)
    const table = screen.getByRole('table', { name: 'Business applications' })

    expect(within(table).getByText(/RM\s1,250,000\.00/)).toBeInTheDocument()
    expect(within(table).getByText('Restricted')).toBeInTheDocument()
  })

  it('rejects a non-numeric TCO and clears the error once corrected', async () => {
    const user = userEvent.setup()
    render(<DesignSystemPage />)
    const tco = screen.getByRole('textbox', { name: 'Total cost of ownership (RM)' })

    await user.type(tco, 'abc')
    await user.tab()
    expect(tco).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter an amount in RM')).toBeInTheDocument()

    await user.clear(tco)
    await user.type(tco, '250000')
    await user.tab()
    expect(screen.queryByText('Enter an amount in RM')).not.toBeInTheDocument()
  })

  it('opens the approval dialog and closes it on Submit', async () => {
    const user = userEvent.setup()
    render(<DesignSystemPage />)

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }))
    const dialog = await screen.findByRole('dialog', { name: 'Submit business case for approval?' })
    await user.click(within(dialog).getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes the approval dialog on Cancel', async () => {
    const user = userEvent.setup()
    render(<DesignSystemPage />)

    await user.click(screen.getByRole('button', { name: 'Submit for approval' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets the user choose a portfolio', async () => {
    const user = userEvent.setup()
    render(<DesignSystemPage />)

    await user.click(screen.getByRole('combobox', { name: 'Portfolio' }))
    await user.click(await screen.findByRole('option', { name: 'Digital' }))

    expect(screen.getByRole('combobox', { name: 'Portfolio' })).toHaveTextContent('Digital')
  })

  it('shows every component group, including the newer ones', () => {
    render(<DesignSystemPage />)

    for (const name of ['Page-level messages', 'Tags and status indicators', 'Checkboxes', 'Pagination', 'Avatars', 'Menus']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('toggles the example checkboxes and keeps the locked one fixed', async () => {
    render(<DesignSystemPage />)
    const approvals = screen.getByRole('checkbox', { name: 'Approvals waiting for me' })
    const reports = screen.getByRole('checkbox', { name: 'Monthly report reminders' })

    await userEvent.click(approvals)
    await userEvent.click(reports)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Security alerts (always on)' }))

    expect(approvals).toHaveAttribute('aria-checked', 'false')
    expect(reports).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'Security alerts (always on)' })).toHaveAttribute('aria-checked', 'true')
  })

  it('moves between example pages', async () => {
    render(<DesignSystemPage />)
    const nav = screen.getByRole('navigation', { name: 'Example pages' })

    await userEvent.click(within(nav).getByRole('button', { name: 'Next page' }))

    expect(within(nav).getByRole('button', { name: 'Page 5' })).toHaveAttribute('aria-current', 'page')
  })

  it('sorts the example table by criticality', async () => {
    render(<DesignSystemPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Criticality' }))

    expect(screen.getByRole('columnheader', { name: 'Criticality' })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('changes the sort order from the example menu', async () => {
    render(<DesignSystemPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Actions for business case BC-1024' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Oldest first' }))

    expect(screen.getByRole('menuitemradio', { name: 'Oldest first' })).toHaveAttribute('aria-checked', 'true')
  })

  it('shows the date picker, search select, textarea and tabs', async () => {
    render(<DesignSystemPage />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Go-live date' }), '01012027')
    expect(screen.getByRole('textbox', { name: 'Go-live date' })).toHaveValue('01/01/2027')
    await userEvent.type(screen.getByRole('combobox', { name: 'Application owner' }), 'raj')
    await userEvent.click(await screen.findByRole('option', { name: /Rajesh Kumar/ }))
    expect(screen.getByRole('combobox', { name: 'Application owner' })).toHaveValue('Rajesh Kumar')
    expect(screen.getByRole('textbox', { name: 'Business justification (optional)' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Costs' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Total cost of ownership by category.')
  })
})
