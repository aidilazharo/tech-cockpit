import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { departments } from '../admin/fixtures'
import { ALI, INSTANCE_ID, instance } from './fixtures'

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const escapeCloses = async (name: string | RegExp) => {
  await screen.findByRole('dialog', { name })
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument())
}

describe('Escape closes dialogs without doing anything', () => {
  it('decision and reassign dialogs', async () => {
    signInWith(['approvals:task:act', 'approvals:instance:read', 'approvals:task:reassign'])
    api.on(`GET /api/v1/approval-instances/${INSTANCE_ID}`, json(200, instance()))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await escapeCloses('Approve "CRM upgrade"?')
    await userEvent.click(screen.getByRole('button', { name: `Reassign ${ALI.name}'s task` }))
    await escapeCloses(`Reassign ${ALI.name}'s task`)
    expect(api.calls.filter((call) => call.method === 'POST')).toEqual([])
  })

  it('the department editor and the delegation form', async () => {
    signInWith(['access:department:manage', 'approvals:delegation:manage', 'approvals:instance:read'])
    api.on('GET /api/v1/departments', json(200, { items: departments }))
    api.on('GET /api/v1/me/delegations', json(200, { items: [] }))
    renderRoute('/admin/departments')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Information Technology' }))
    await escapeCloses('Edit Information Technology')
  })

  it('the delegation form, and a retry when delegations fail', async () => {
    signInWith(['approvals:delegation:manage', 'approvals:instance:read'])
    api.on('GET /api/v1/me/delegations', problem(500, 'Internal Server Error'))
    renderRoute('/approvals/out-of-office')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/me/delegations', json(200, { items: [] }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add delegation' }))
    await escapeCloses('Add delegation')
    await userEvent.click(screen.getByRole('button', { name: 'Add delegation' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Audit entry without a person', () => {
  it('shows a system entry with only what it has', async () => {
    signInWith(['audit:log:read'])
    api.on('GET /api/v1/audit-logs/facets', json(200, { actions: [], resourceTypes: [] }))
    api.on(
      'GET /api/v1/audit-logs',
      json(200, {
        items: [
          {
            id: '80000000-0000-4000-8000-000000000009',
            occurredAt: '2026-10-21T02:00:00.000Z',
            actorUserId: null,
            actor: null,
            authMethod: null,
            action: 'approval.submitted',
            resourceType: null,
            resourceId: null,
            httpMethod: null,
            path: null,
            statusCode: null,
            requestId: null,
            ipAddress: null,
            changes: { after: { status: 'in_progress' } },
            metadata: null,
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
      }),
    )
    renderRoute('/admin/audit-log')

    await userEvent.click(await screen.findByRole('button', { name: /Details of entry at/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Audit entry' })
    expect(dialog).toHaveTextContent('System')
    expect(within(dialog).queryByText('More information')).not.toBeInTheDocument()
    expect(within(within(dialog).getByRole('table', { name: 'Changes' })).getAllByRole('row')[1]).toHaveTextContent('status—in_progress')
  })
})
