import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../../test/harness'
import { retention, STANDARD_ID } from '../../sad/fixtures'

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/sad/retention-standards', json(200, { items: [...retention, { ...retention[1], id: '8e000000-0000-4000-8000-000000000003', active: false, dataType: 'Old data' }] }))
  signInWith(['sad:retention:manage'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Backup retention list', () => {
  it('lists the standard rows with their state', async () => {
    renderRoute('/admin/sad-retention')
    const rows = within(await screen.findByRole('table', { name: 'Backup retention' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Database - MsSQL on VMFinancial Transaction8 Years12 months5 weeks7 daysIn use')
    expect(rows[3]).toHaveTextContent('Retired')
  })

  it('adds a row, checking every value is filled', async () => {
    api.on('POST /api/v1/sad/retention-standards', json(201, { ...retention[0], id: '8e000000-0000-4000-8000-000000000009', serviceType: 'Cosmos DB' }))
    renderRoute('/admin/sad-retention')
    await userEvent.click(await screen.findByRole('button', { name: 'Add a row' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a retention row' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getAllByText('Enter a value')).toHaveLength(6)
    for (const [label, value] of [
      ['Service type', 'Cosmos DB'],
      ['Data type hosted', 'Others'],
      ['Yearly backup', '-'],
      ['Monthly backup', '12 months'],
      ['Weekly backup', '5 weeks'],
      ['Daily backup', '7 days'],
    ]) {
      await userEvent.type(within(dialog).getByRole('textbox', { name: label }), value)
    }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/sad/retention-standards')[0].body).toEqual({ serviceType: 'Cosmos DB', dataType: 'Others', yearly: '-', monthly: '12 months', weekly: '5 weeks', daily: '7 days', comment: null })
  })

  it('changes a row with its version, and retires and brings back rows', async () => {
    api.on(`PATCH /api/v1/sad/retention-standards/${STANDARD_ID}`, json(200, retention[0]))
    api.on('PATCH /api/v1/sad/retention-standards/8e000000-0000-4000-8000-000000000003', json(200, retention[1]))
    renderRoute('/admin/sad-retention')
    await userEvent.click(await screen.findByRole('button', { name: 'Change Database - MsSQL on VM — Financial Transaction' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change a retention row' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Comment (optional)' }), 'Per policy')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/sad/retention-standards/${STANDARD_ID}`)[0].body).toMatchObject({ comment: 'Per policy', version: 1, yearly: '8 Years' }))
    await userEvent.click(screen.getByRole('button', { name: 'Retire Database - MsSQL on VM — Financial Transaction' }))
    expect(api.callsTo(`PATCH /api/v1/sad/retention-standards/${STANDARD_ID}`)[1].body).toEqual({ active: false, version: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Bring back Storage Account - Blob Container — Old data' }))
    expect(api.callsTo('PATCH /api/v1/sad/retention-standards/8e000000-0000-4000-8000-000000000003')[0].body).toEqual({ active: true, version: 1 })
  })

  it('shows a refused change, and offers a retry when the list cannot load', async () => {
    let fail = true
    api.on('GET /api/v1/sad/retention-standards', () => (fail ? problem(500, 'Server error') : json(200, { items: retention })))
    api.on(`PATCH /api/v1/sad/retention-standards/${STANDARD_ID}`, problem(409, 'Conflict', 'Someone else changed this row.'))
    renderRoute('/admin/sad-retention')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    await userEvent.click(await screen.findByRole('button', { name: 'Retire Database - MsSQL on VM — Financial Transaction' }))
    expect(await screen.findByText('Someone else changed this row.')).toBeInTheDocument()
  })

  it('is only for people who maintain it', async () => {
    signInWith(['sad:backup:read'])
    renderRoute('/admin/sad-retention')
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })
})
