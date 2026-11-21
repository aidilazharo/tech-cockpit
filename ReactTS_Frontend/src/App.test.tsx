import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { useAuthStore } from './auth/auth-store'
import { useThemeStore } from './theme/theme-store'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  useAuthStore.setState({ status: 'idle', me: null, notice: null })
})

describe('App', () => {
  it('routes the browser URL and applies the theme preference', async () => {
    window.history.replaceState(null, '', '/design-system')
    useThemeStore.setState({ preference: 'dark' })
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Qi design system' })).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('dark')
    useThemeStore.setState({ preference: 'system' })
  })

  it('puts every other page behind sign-in', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading TechCockpit…')
  })
})
