import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageReload } from '../lib/page-reload'
import { json, mockApi, renderRoute, signInWith } from '../test/harness'
import { RouteError } from './RouteError'

// A page that crashes while rendering (the real routes must show RouteError inside the layout).
vi.mock('../features/notifications/NotificationsPage', () => ({
  NotificationsPage: () => {
    throw new Error('Secret internal detail')
  },
}))

let reload: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  const api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  reload = vi.spyOn(pageReload, 'reload').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

/** A page whose code cannot be downloaded, failing the way a browser reports it. */
function renderUndownloadablePage() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        lazy: () => Promise.reject(new TypeError('error loading dynamically imported module: http://localhost:5173/src/features/me/ApiKeysPage.tsx')),
        errorElement: <RouteError />,
      },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

describe('route errors', () => {
  it('explains that a page could not be loaded and reloads once by itself', async () => {
    renderUndownloadablePage()
    expect(await screen.findByRole('heading', { level: 1, name: 'This page could not be loaded' })).toBeInTheDocument()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload by itself again straight after a reload', async () => {
    sessionStorage.setItem('tc:reloaded-for-update', String(Date.now()))
    renderUndownloadablePage()
    expect(await screen.findByRole('heading', { level: 1, name: 'This page could not be loaded' })).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('shows a plain message inside the layout, without technical details, when a page fails', async () => {
    signInWith([])
    renderRoute('/notifications')
    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.queryByText(/Secret internal detail/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
    expect(reload).not.toHaveBeenCalled()
  })
})
