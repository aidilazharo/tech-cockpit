import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import type { AuditEntry } from './schemas'

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: '80000000-0000-4000-8000-000000000001',
  occurredAt: '2026-10-21T02:00:00.000Z',
  actorUserId: '72000000-0000-4000-8000-000000000001',
  actor: { id: '72000000-0000-4000-8000-000000000001', name: 'Ali Approver', email: 'ali@aia.com' },
  authMethod: 'session',
  action: 'user.updated',
  resourceType: 'user',
  resourceId: 'u-1',
  httpMethod: null,
  path: null,
  statusCode: null,
  requestId: null,
  ipAddress: null,
  changes: { before: { status: 'active', firstName: 'Ana' }, after: { status: 'disabled' } },
  metadata: { source: 'okta' },
  ...overrides,
})

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/audit-logs/facets', json(200, { actions: ['http.request', 'user.updated'], resourceTypes: ['user'] }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Audit log', () => {
  it('lists entries with who did what, including the system and unknown callers', async () => {
    signInWith(['audit:log:read'])
    api.on(
      'GET /api/v1/audit-logs',
      json(200, {
        items: [
          entry(),
          entry({ id: '80000000-0000-4000-8000-000000000002', actorUserId: null, actor: null, authMethod: null, action: 'approval.submitted', changes: null, metadata: null }),
          entry({ id: '80000000-0000-4000-8000-000000000003', actorUserId: null, actor: null, authMethod: null, action: 'auth.failed', httpMethod: 'GET', path: '/api/v1/me', statusCode: 401, resourceType: null, resourceId: null }),
        ],
        page: 1,
        pageSize: 50,
        total: 3,
      }),
    )
    renderRoute('/admin/audit-log')

    const rows = within(await screen.findByRole('table', { name: 'Audit entries' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ali Approver')
    expect(rows[1]).toHaveTextContent('ali@aia.com')
    expect(rows[1]).toHaveTextContent('user.updated')
    expect(rows[1]).toHaveTextContent('user u-1')
    expect(rows[2]).toHaveTextContent('System')
    expect(rows[3]).toHaveTextContent('Not signed in')
    expect(rows[3]).toHaveTextContent('401')
  })

  it('filters by person, action, record and date range (Malaysia days)', async () => {
    signInWith(['audit:log:read'])
    api.on('GET /api/v1/audit-logs', json(200, { items: [], page: 1, pageSize: 50, total: 0 }))
    renderRoute('/admin/audit-log')

    expect(await screen.findByText('No entries match')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: "Person's email" }), 'ali@aia.com')
    await userEvent.click(screen.getByRole('combobox', { name: 'Action' }))
    await userEvent.click(await screen.findByRole('option', { name: 'user.updated' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Record type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'user' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Record id' }), 'u-1')
    await userEvent.type(screen.getByRole('textbox', { name: 'From' }), '01102026')
    await userEvent.type(screen.getByRole('textbox', { name: 'To' }), '21102026')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/audit-logs').at(-1)?.path).toBe(
        '/api/v1/audit-logs?page=1&pageSize=50&actorEmail=ali%40aia.com&action=user.updated&resourceType=user&resourceId=u-1&from=2026-09-30T16%3A00%3A00.000Z&to=2026-10-21T16%3A00%3A00.000Z',
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(api.callsTo('GET /api/v1/audit-logs').at(-1)?.path).toBe('/api/v1/audit-logs?page=1&pageSize=50'))
    expect(screen.getByRole('textbox', { name: "Person's email" })).toHaveValue('')
  })

  it('shows an entry with its request details and before/after changes', async () => {
    signInWith(['audit:log:read'])
    api.on('GET /api/v1/audit-logs', json(200, { items: [entry({ httpMethod: 'PATCH', path: '/api/v1/users/u-1', statusCode: 200, requestId: 'req-9', ipAddress: '10.0.0.1' })], page: 1, pageSize: 50, total: 120 }))
    renderRoute('/admin/audit-log')

    await userEvent.click(await screen.findByRole('button', { name: /Details of entry at/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' })
    expect(dialog).toHaveTextContent('Ali Approver (ali@aia.com)')
    expect(dialog).toHaveTextContent('PATCH /api/v1/users/u-1')
    expect(dialog).toHaveTextContent('10.0.0.1')
    expect(dialog).toHaveTextContent('{"source":"okta"}')
    const changes = within(within(dialog).getByRole('table', { name: 'Changes' })).getAllByRole('row')
    expect(changes[1]).toHaveTextContent('statusactivedisabled')
    expect(changes[2]).toHaveTextContent('firstNameAna—')
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Page 3' }))
    await waitFor(() => expect(api.callsTo('GET /api/v1/audit-logs').at(-1)?.path).toContain('page=3'))
  })

  it('shows structured values of a change, and a change with nothing after it', async () => {
    signInWith(['audit:log:read'])
    api.on('GET /api/v1/audit-logs', json(200, { items: [entry({ action: 'refused-sign-in.dismissed', changes: { before: { scope: { type: 'global' } }, after: null } })], page: 1, pageSize: 50, total: 1 }))
    renderRoute('/admin/audit-log')
    await userEvent.click(await screen.findByRole('button', { name: /Details of entry at/ }))
    const changes = within(within(await screen.findByRole('dialog', { name: 'Audit entry' })).getByRole('table', { name: 'Changes' })).getAllByRole('row')
    expect(changes[1]).toHaveTextContent('scope{"type":"global"}—')
  })

  it('refuses people without audit:log:read, and offers a retry on failure', async () => {
    signInWith([])
    renderRoute('/admin/audit-log')
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })

  it('offers a retry when the log cannot load', async () => {
    signInWith(['audit:log:read'])
    api.on('GET /api/v1/audit-logs', problem(500, 'Internal Server Error'))
    renderRoute('/admin/audit-log')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
  })
})
