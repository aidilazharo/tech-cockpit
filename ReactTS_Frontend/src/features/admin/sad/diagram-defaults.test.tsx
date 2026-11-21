import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../../test/harness'

const DEFAULTS = { subscription: 'MY01', primaryRegion: 'southeastasia', drRegion: 'eastasia', primaryDc: 'PDC', drDc: 'SDC', officeNetwork: 'Office network', version: 1 }

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/sad/diagram-defaults', json(200, DEFAULTS))
  signInWith(['sad:diagram-defaults:manage'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const choose = async (label: string, option: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}
const retype = async (label: string, text: string) => {
  await userEvent.clear(screen.getByLabelText(label))
  if (text) await userEvent.type(screen.getByLabelText(label), text)
}

describe('SAD diagram defaults', () => {
  it('shows the names new infrastructure diagrams start with, from the side navigation', async () => {
    renderRoute('/')
    await userEvent.click(await screen.findByRole('link', { name: 'SAD diagram defaults' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'SAD diagram defaults' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Subscription')).toHaveValue('MY01')
    expect(screen.getByRole('combobox', { name: 'Primary region' })).toHaveTextContent('Southeast Asia')
    expect(screen.getByRole('combobox', { name: 'DR region' })).toHaveTextContent('East Asia')
    expect(screen.getByLabelText('Primary data centre')).toHaveValue('PDC')
    expect(screen.getByLabelText('DR data centre')).toHaveValue('SDC')
    expect(screen.getByLabelText('Office network')).toHaveValue('Office network')
  })

  it('saves changed defaults with their version, after checking each pair differs and every name is filled', async () => {
    api.on('PUT /api/v1/sad/diagram-defaults', (call) => json(200, { ...(call.body as object), version: 2 }))
    renderRoute('/admin/sad-diagram-defaults')
    await screen.findByLabelText('Subscription')
    await retype('Subscription', '')
    await choose('DR region', 'Southeast Asia')
    await retype('DR data centre', 'PDC')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter a name')).toBeInTheDocument()
    expect(screen.getByText('Choose a region other than the primary one')).toBeInTheDocument()
    expect(screen.getByText('Use a name other than the primary data centre')).toBeInTheDocument()
    expect(api.callsTo('PUT /api/v1/sad/diagram-defaults')).toHaveLength(0)

    await retype('Subscription', ' MY02 ')
    await choose('Primary region', 'Malaysia West')
    await retype('DR data centre', 'SDC')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Diagram defaults saved. Infrastructure diagrams set up from now on start with them.')).toBeInTheDocument()
    expect(api.callsTo('PUT /api/v1/sad/diagram-defaults')[0].body).toEqual({ ...DEFAULTS, subscription: 'MY02', primaryRegion: 'malaysiawest', drRegion: 'southeastasia' })
  })

  it('says when someone else saved first, and when the defaults cannot load', async () => {
    api.on('PUT /api/v1/sad/diagram-defaults', problem(409, 'Conflict', 'Someone else changed the diagram defaults. Reload to see their changes.'))
    renderRoute('/admin/sad-diagram-defaults')
    await screen.findByLabelText('Subscription')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Someone else changed the diagram defaults. Reload to see their changes.')).toBeInTheDocument()

    api.on('GET /api/v1/sad/diagram-defaults', problem(500, 'Server error'))
    renderRoute('/admin/sad-diagram-defaults')
    const loads = api.callsTo('GET /api/v1/sad/diagram-defaults').length
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(api.callsTo('GET /api/v1/sad/diagram-defaults').length).toBeGreaterThan(loads)
  })

  it('is not offered without the permission', async () => {
    signInWith(['sad:retention:manage'])
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'Backup retention' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'SAD diagram defaults' })).not.toBeInTheDocument()
  })
})
