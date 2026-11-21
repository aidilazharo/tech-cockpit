import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { page, PORTFOLIO_GROUP, portfolios, RUN_ID, syncRun } from './fixtures'

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TRM sync runs', () => {
  it('pages through the runs', async () => {
    signInWith(['trm:sync:run'])
    const summary = Object.fromEntries(Object.entries(syncRun()).filter(([key]) => key !== 'report'))
    api.on('GET /api/v1/trm/sync-runs', json(200, { ...page([summary]), total: 60 }))
    renderRoute('/admin/trm-sync')
    await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(api.callsTo('GET /api/v1/trm/sync-runs').at(-1)!.path).toContain('page=2'))
  })

  it('lists runs and explains how to load exports', async () => {
    signInWith(['trm:sync:run'])
    const summary = Object.fromEntries(Object.entries(syncRun()).filter(([key]) => key !== 'report'))
    api.on('GET /api/v1/trm/sync-runs', json(200, page([summary, { ...summary, id: '87000000-0000-4000-8000-000000000002', status: 'failed', dryRun: true, completedAt: null, error: 'The sync failed and nothing was changed.' }])))
    renderRoute('/admin/trm-sync')

    expect(await screen.findByRole('heading', { level: 1, name: 'TRM sync runs' })).toBeInTheDocument()
    expect(screen.getByText(/npm run trm:sync -- --dir/)).toBeInTheDocument()
    const rows = within(await screen.findByRole('table', { name: 'Sync runs' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ada Admin')
    expect(rows[1]).toHaveTextContent('Completed')
    expect(rows[1]).toHaveTextContent('2 exports')
    expect(within(rows[1]).getByRole('link')).toHaveAttribute('href', `/admin/trm-sync/${RUN_ID}`)
    expect(rows[2]).toHaveTextContent('Failed')
    expect(rows[2]).toHaveTextContent('Dry run')
  })

  it('shows a run report: counts, links and what could not be matched', async () => {
    signInWith(['trm:sync:run'])
    api.on(`GET /api/v1/trm/sync-runs/${RUN_ID}`, json(200, syncRun()))
    renderRoute(`/admin/trm-sync/${RUN_ID}`)

    expect(await screen.findByRole('heading', { level: 1, name: /Sync run of/ })).toBeInTheDocument()
    const records = screen.getByRole('table', { name: 'Records' })
    expect(within(within(records).getAllByRole('row')[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Applications', '20', '2', '3', '15', '1', '0', 'Included'])
    expect(within(records).getAllByRole('row')[2]).toHaveTextContent('Export not included')
    expect(screen.getByRole('table', { name: 'Links' })).toHaveTextContent('Application → application service')
    expect(screen.getByText('4 applications have capability fields that do not follow the capability tree.')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Not matched' })).toHaveTextContent('Unknown service')
    expect(screen.getByRole('table', { name: 'Skipped rows' })).toHaveTextContent('missing sys_id')
    expect(screen.getByRole('table', { name: 'Capability tree problems' })).toHaveTextContent('Orphan')
  })

  it('shows a dry run, a failed run and a run still receiving', async () => {
    signInWith(['trm:sync:run'])
    api.on(`GET /api/v1/trm/sync-runs/${RUN_ID}`, json(200, syncRun({ dryRun: true, report: { ...syncRun().report!, truncated: true, capabilityIssues: [{ name: null, problem: 'cycle' }] } })))
    renderRoute(`/admin/trm-sync/${RUN_ID}`)
    expect(await screen.findByText('Dry run: this report shows what would change. Nothing was changed.')).toBeInTheDocument()
    expect(screen.getByText('Lists were cut to their first 500 entries.')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Capability tree problems' })).toHaveTextContent('(no name)Parents form a loop')

    cleanup()
    vi.unstubAllGlobals()
    api = mockApi()
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
    api.on(`GET /api/v1/trm/sync-runs/${RUN_ID}`, json(200, syncRun({ status: 'failed', report: null, completedAt: null, received: {}, error: 'The sync failed and nothing was changed.' })))
    renderRoute(`/admin/trm-sync/${RUN_ID}`)
    expect(await screen.findByText('The sync failed and nothing was changed.')).toBeInTheDocument()
    expect(screen.getByText('No report: the run did not complete.')).toBeInTheDocument()
  })

  it('is for system admins only, and offers a retry', async () => {
    signInWith(['trm:application:read'])
    renderRoute('/admin/trm-sync')
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()

    cleanup()
    vi.unstubAllGlobals()
    api = mockApi()
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
    signInWith(['trm:sync:run'])
    let fail = true
    api.on('GET /api/v1/trm/sync-runs', () => (fail ? problem(500, 'Server error') : json(200, page([]))))
    renderRoute('/admin/trm-sync')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No sync runs yet')).toBeInTheDocument()
  })
})

describe('Portfolios (system admins)', () => {
  it('adds, renames, deactivates and reactivates portfolios', async () => {
    signInWith(['portfolio:portfolio:manage', 'trm:application:read'])
    let items = [...portfolios]
    api.on('GET /api/v1/portfolios', () => json(200, { items }))
    api.on('POST /api/v1/portfolios', (call) => {
      const created = { id: '86000000-0000-4000-8000-000000000009', name: (call.body as { name: string }).name, active: true, version: 1 }
      items = [...items, created]
      return json(201, created)
    })
    api.on('PATCH /api/v1/portfolios/:id', () => json(200, portfolios[0]))
    api.on(`PATCH /api/v1/portfolios/${PORTFOLIO_GROUP}`, (call) => {
      const body = call.body as { name?: string; active?: boolean; version: number }
      items = items.map((p) => (p.id === PORTFOLIO_GROUP ? { ...p, ...body, version: p.version + 1 } : p))
      return json(200, items.find((p) => p.id === PORTFOLIO_GROUP))
    })
    renderRoute('/admin/portfolios')

    const table = await screen.findByRole('table', { name: 'Portfolios' })
    expect(within(table).getAllByRole('row')[3]).toHaveTextContent('Inactive')

    await userEvent.click(screen.getByRole('button', { name: 'Add portfolio' }))
    let dialog = await screen.findByRole('dialog', { name: 'Add portfolio' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add portfolio' }))
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Wealth')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add portfolio' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/portfolios')[0].body).toEqual({ name: 'Wealth' })
    expect(await within(table).findByText('Wealth')).toBeInTheDocument()

    await userEvent.click(within(table).getByRole('button', { name: 'Rename Group' }))
    dialog = await screen.findByRole('dialog', { name: 'Rename Group' })
    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Group Functions')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo(`PATCH /api/v1/portfolios/${PORTFOLIO_GROUP}`)[0].body).toEqual({ name: 'Group Functions', version: 1 })

    await userEvent.click(await within(table).findByRole('button', { name: 'Deactivate Group Functions' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/portfolios/${PORTFOLIO_GROUP}`)[1].body).toEqual({ active: false, version: 2 }))
    await userEvent.click(await within(table).findByRole('button', { name: 'Reactivate Group Functions' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/portfolios/${PORTFOLIO_GROUP}`)[2].body).toEqual({ active: true, version: 3 }))
  })

  it('shows refusals, and is for system admins only', async () => {
    signInWith(['portfolio:portfolio:manage', 'trm:application:read'])
    api.on('GET /api/v1/portfolios', json(200, { items: portfolios }))
    api.on('POST /api/v1/portfolios', problem(409, 'Conflict', 'A portfolio with this name already exists'))
    renderRoute('/admin/portfolios')
    await userEvent.click(await screen.findByRole('button', { name: 'Add portfolio' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Retail')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add portfolio' }))
    expect(await within(dialog).findByText('A portfolio with this name already exists')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add portfolio' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    cleanup()
    vi.unstubAllGlobals()
    api = mockApi()
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
    signInWith(['trm:application:read'])
    renderRoute('/admin/portfolios')
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })

  it('offers a retry when portfolios cannot be loaded', async () => {
    signInWith(['portfolio:portfolio:manage', 'trm:application:read'])
    let fail = true
    api.on('GET /api/v1/portfolios', () => (fail ? problem(500, 'Server error') : json(200, { items: [] })))
    renderRoute('/admin/portfolios')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No portfolios yet')).toBeInTheDocument()
  })
})
