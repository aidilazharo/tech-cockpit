import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import type { Notification } from './schemas'

const note = (n: number, overrides: Partial<Notification> = {}): Notification => ({
  id: `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  type: 'approval.request.returned',
  params: { subjectTitle: `Request ${n}`, workflow: 'Business case', step: 'Review', reason: 'Missing costs' },
  link: '/approvals/70000000-0000-4000-8000-000000000001',
  readAt: null,
  createdAt: '2026-10-21T02:00:00.000Z',
  ...overrides,
})

const page = (items: Notification[], unread: number, total = items.length) => json(200, { items, page: 1, pageSize: 20, total, unread })

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Notification bell', () => {
  it('shows the unread count and the latest notifications', async () => {
    signInWith([])
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 2 }))
    api.on('GET /api/v1/me/notifications', page([note(1), note(2, { readAt: '2026-10-21T03:00:00.000Z' })], 2))
    renderRoute('/')

    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    expect(api.callsTo('GET /api/v1/me/notifications')).toHaveLength(0)
    await userEvent.click(bell)

    const popup = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(await within(popup).findByText('Your Business case "Request 1" was returned')).toBeInTheDocument()
    expect(within(popup).getAllByText('Reason: Missing costs')).toHaveLength(2)
    expect(within(popup).getAllByText('Unread')).toHaveLength(1)
    expect(api.callsTo('GET /api/v1/me/notifications')[0].path).toContain('pageSize=8')
  })

  it('opens a notification: marks it read and goes to its page', async () => {
    signInWith([])
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 1 }))
    api.on('GET /api/v1/me/notifications', page([note(1)], 1))
    api.on('POST /api/v1/me/notifications/60000000-0000-4000-8000-000000000001/read', json(200, note(1, { readAt: '2026-10-21T03:00:00.000Z' })))
    const { here } = renderRoute('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
    await userEvent.click(await screen.findByRole('button', { name: /Request 1/ }))

    await waitFor(() => expect(here()).toBe('/approvals/70000000-0000-4000-8000-000000000001'))
    expect(api.callsTo('POST /api/v1/me/notifications/60000000-0000-4000-8000-000000000001/read')).toHaveLength(1)
  })

  it('does nothing more for a notification already read and without a page', async () => {
    signInWith([])
    api.on('GET /api/v1/me/notifications', page([note(1, { readAt: '2026-10-21T03:00:00.000Z', link: null })], 1))
    const { here } = renderRoute('/')
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Request 1/ }))
    expect(here()).toBe('/')
    expect(api.callsTo('POST /api/v1/me/notifications/60000000-0000-4000-8000-000000000001/read')).toHaveLength(0)
  })

  it('marks everything read and links to all notifications', async () => {
    signInWith([])
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 120 }))
    api.on('GET /api/v1/me/notifications', page([note(1)], 120))
    api.on('POST /api/v1/me/notifications/read-all', json(200, { updated: 120 }))
    const { here } = renderRoute('/')

    const bell = await screen.findByRole('button', { name: 'Notifications, 120 unread' })
    expect(bell).toHaveTextContent('99+')
    await userEvent.click(bell)
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }))
    expect(api.callsTo('POST /api/v1/me/notifications/read-all')).toHaveLength(1)
    await userEvent.click(screen.getByRole('link', { name: 'See all notifications' }))

    await waitFor(() => expect(here()).toBe('/notifications'))
  })

  it('says when there is nothing, and has a plain name without unread', async () => {
    signInWith([])
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
    api.on('GET /api/v1/me/notifications', page([], 0))
    renderRoute('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }))

    expect(await screen.findByText('You have no notifications')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument()
  })
})

describe('Notifications page', () => {
  it('lists notifications with paging, and filters unread ones', async () => {
    signInWith([])
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 1 }))
    api.on('GET /api/v1/me/notifications', (call) =>
      call.path.includes('unread=true') ? page([], 0, 0) : page([note(1), note(2, { type: 'approval.task.info-answered', params: { subjectTitle: 'X', answer: 'Yes' } })], 1, 45),
    )
    api.on('POST /api/v1/me/notifications/read-all', json(200, { updated: 1 }))
    renderRoute('/notifications')

    expect(await screen.findByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument()
    expect(await screen.findByText('Answer: Yes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(api.callsTo('GET /api/v1/me/notifications').at(-1)?.path).toContain('page=2'))

    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    expect(api.callsTo('POST /api/v1/me/notifications/read-all')).toHaveLength(1)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show unread only' }))
    expect(await screen.findByText('You have read everything')).toBeInTheDocument()
  })

  it('offers a retry when notifications cannot load', async () => {
    signInWith([])
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
    api.on('GET /api/v1/me/notifications', problem(500, 'Internal Server Error'))
    renderRoute('/notifications')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/me/notifications', page([], 0))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('You have no notifications')).toBeInTheDocument()
  })
})
