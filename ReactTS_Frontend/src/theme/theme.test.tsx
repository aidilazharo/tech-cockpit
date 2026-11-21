import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeController } from './ThemeController'
import { ThemeSwitcher } from './ThemeSwitcher'
import { applyTheme, safeLocalStorage, useThemeStore } from './theme-store'

describe('applyTheme', () => {
  it('sets data-theme for an explicit light or dark choice', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('removes data-theme for "system" so the OS preference applies', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('safeLocalStorage', () => {
  it('reads and writes through localStorage', () => {
    safeLocalStorage.setItem('k', 'v')
    expect(safeLocalStorage.getItem('k')).toBe('v')
    safeLocalStorage.removeItem('k')
    expect(safeLocalStorage.getItem('k')).toBeNull()
  })

  it('keeps working when storage is blocked (private mode, policy)', () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(safeLocalStorage.getItem('k')).toBeNull()
    expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow()
    expect(() => safeLocalStorage.removeItem('k')).not.toThrow()
    blocked.mockRestore()
    vi.restoreAllMocks()
  })
})

describe('ThemeController + ThemeSwitcher', () => {
  it('applies the stored preference on mount', () => {
    useThemeStore.setState({ preference: 'dark' })
    render(<ThemeController />)
    expect(document.documentElement.dataset.theme).toBe('dark')
    useThemeStore.setState({ preference: 'system' })
  })

  it('lets the user pick dark mode from the theme dropdown', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ThemeController />
        <ThemeSwitcher />
      </>,
    )

    await user.click(screen.getByRole('combobox', { name: 'Theme' }))
    await user.click(await screen.findByRole('option', { name: 'Dark' }))

    expect(useThemeStore.getState().preference).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    useThemeStore.setState({ preference: 'system' })
  })
})
