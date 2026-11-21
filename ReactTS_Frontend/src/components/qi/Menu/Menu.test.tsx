import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Menu, MenuItem, MenuRadioGroup, MenuSection, MenuSeparator } from './Menu'

function Harness({ onSignOut = () => {}, onArchive = () => {} }: { onSignOut?: () => void; onArchive?: () => void }) {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  return (
    <>
      <p>Theme is {theme}</p>
      <Menu label="Account menu" trigger={<span>TA</span>}>
        <MenuSection>
          <p>Test Admin</p>
        </MenuSection>
        <MenuSeparator />
        <MenuRadioGroup
          label="Theme"
          value={theme}
          onValueChange={setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <MenuSeparator />
        <MenuItem onClick={onArchive} disabled>
          Archive
        </MenuItem>
        <MenuItem onClick={onSignOut}>Sign out</MenuItem>
      </Menu>
    </>
  )
}

describe('Menu', () => {
  it('opens from its labelled trigger and shows its content', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Test Admin')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('runs an item action and closes', async () => {
    const onSignOut = vi.fn()
    render(<Harness onSignOut={onSignOut} />)

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(onSignOut).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('selects one radio option and reports the change', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await screen.findByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))

    expect(screen.getByText('Theme is dark')).toBeInTheDocument()
  })

  it('works with the keyboard: Enter opens on the first item, arrows move, Escape closes and returns focus', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    trigger.focus()

    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveFocus())

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('announces and skips a disabled item', async () => {
    const onArchive = vi.fn()
    render(<Harness onArchive={onArchive} />)

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    const archive = await screen.findByRole('menuitem', { name: 'Archive' })
    expect(archive).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(archive)

    expect(onArchive).not.toHaveBeenCalled()
  })

  it('renders in the dark theme', async () => {
    document.documentElement.dataset.theme = 'dark'
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(await screen.findByRole('menu')).toBeVisible()
  })
})
