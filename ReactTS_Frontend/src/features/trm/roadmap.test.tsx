import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, ME_ID, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { APP_BILLING, APP_CRM, applicationSummary, CAP_ONBOARDING, capabilities, INITIATIVE_ID, initiative, page, PLANNED_ID } from './fixtures'

const READ = ['trm:roadmap:read', 'trm:application:read']
const MANAGE = [...READ, 'trm:roadmap:manage']
let api: ReturnType<typeof mockApi>

const summary = {
  id: INITIATIVE_ID,
  name: 'Modernise CRM',
  status: 'approved',
  startDate: '2027-01-01',
  endDate: '2028-06-30',
  owner: { id: ME_ID, name: 'Ada Admin' },
  actionCounts: { introduce: 1, enhance: 0, replace: 1, retire: 1 },
}
const planned = {
  items: [
    { id: PLANNED_ID, name: 'New CRM', linkedApplication: null, initiatives: [{ id: INITIATIVE_ID, name: 'Modernise CRM' }] },
    { id: '8b000000-0000-4000-8000-000000000002', name: 'New Billing', linkedApplication: { id: APP_BILLING, name: 'Billing' }, initiatives: [] },
  ],
}

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/trm/initiatives', json(200, page([summary])))
  api.on('GET /api/v1/trm/planned-applications', json(200, planned))
  api.on('GET /api/v1/trm/capabilities', json(200, { items: capabilities }))
  api.on('GET /api/v1/trm/applications', json(200, page([applicationSummary(), applicationSummary({ id: APP_BILLING, name: 'Billing', number: 'APM-2' })])))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const choose = async (container: HTMLElement, filter: string, option: string) => {
  await userEvent.click(within(container).getByRole('combobox', { name: filter }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('EA roadmap', () => {
  it('lists initiatives with their timeline and planned applications', async () => {
    signInWith(READ)
    renderRoute('/trm/roadmap')
    const rows = within(await screen.findByRole('table', { name: 'Initiatives' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Modernise CRM')
    expect(rows[1]).toHaveTextContent('Approved')
    expect(rows[1]).toHaveTextContent('01/01/2027')
    expect(rows[1]).toHaveTextContent('Ada Admin')
    expect(rows[1]).toHaveTextContent('1 Introduce · 1 Replace · 1 Retire')
    const bar = within(screen.getByRole('list', { name: 'Roadmap timeline' })).getByRole('listitem')
    expect(bar).toHaveTextContent('Modernise CRMApproved01/01/2027 to 30/06/2028')
    expect(bar.querySelector('[data-bar]')).toHaveClass('bg-data-visualisation-category-4') // approved = blue
    expect(screen.getByRole('list', { name: 'Timeline legend' })).toHaveTextContent('ProposedApprovedIn progressCompletedCancelled')
    const plannedTable = screen.getByRole('table', { name: 'Planned applications' })
    expect(plannedTable).toHaveTextContent('Not linked yet')
    expect(within(plannedTable).getByRole('link', { name: 'Billing' })).toBeInTheDocument()
    // Viewers cannot add or link.
    expect(screen.queryByRole('link', { name: 'New initiative' })).not.toBeInTheDocument()
    expect(within(plannedTable).queryByRole('button')).not.toBeInTheDocument()
  })

  it('filters by name, status and dates', async () => {
    signInWith(READ)
    renderRoute('/trm/roadmap')
    await screen.findByRole('table', { name: 'Initiatives' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name' }), 'crm')
    await choose(document.body, 'Status', 'In progress')
    await userEvent.type(screen.getByRole('textbox', { name: 'Running on or after' }), '01012027')
    await userEvent.type(screen.getByRole('textbox', { name: 'Starting on or before' }), '31122028')
    await waitFor(() => {
      const query = new URLSearchParams(api.callsTo('GET /api/v1/trm/initiatives').at(-1)!.path.split('?')[1])
      expect([query.get('q'), query.get('status'), query.get('from'), query.get('to')]).toEqual(['crm', 'in_progress', '2027-01-01', '2028-12-31'])
    })
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  })

  it('pages, keeps Enter on the page, clears a date, and shows an initiative with no owner or actions', async () => {
    signInWith(READ)
    api.on('GET /api/v1/trm/initiatives', json(200, page([{ ...summary, owner: null, actionCounts: { introduce: 0, enhance: 0, replace: 0, retire: 0 } }], 60)))
    const { here } = renderRoute('/trm/roadmap')
    const row = within(await screen.findByRole('table', { name: 'Initiatives' })).getAllByRole('row')[1]
    expect(row).toHaveTextContent('Modernise CRM')
    expect(row).toHaveTextContent('—')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name' }), 'crm{Enter}')
    expect(here()).toContain('/trm/roadmap')
    const from = screen.getByRole('textbox', { name: 'Running on or after' })
    await userEvent.type(from, '01012027')
    await waitFor(() => expect(here()).toContain('from=2027-01-01'))
    await userEvent.clear(from)
    await waitFor(() => expect(here()).not.toContain('from='))
    const to = screen.getByRole('textbox', { name: 'Starting on or before' })
    await userEvent.type(to, '31122028')
    await waitFor(() => expect(here()).toContain('to=2028-12-31'))
    await userEvent.clear(to)
    await waitFor(() => expect(here()).not.toContain('to='))
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(here()).toContain('page=2'))
  })

  it('unlinks a planned application, and can be closed without saving', async () => {
    signInWith(MANAGE)
    api.on(`PUT /api/v1/trm/planned-applications/8b000000-0000-4000-8000-000000000002/link`, json(200, planned))
    renderRoute('/trm/roadmap')
    api.on(`PUT /api/v1/trm/planned-applications/${PLANNED_ID}/link`, json(200, planned))
    await userEvent.click(await screen.findByRole('button', { name: 'Link New CRM to a real application' }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Saving without choosing leaves it unlinked.
    await userEvent.click(screen.getByRole('button', { name: 'Link New CRM to a real application' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Link New CRM' })).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo(`PUT /api/v1/trm/planned-applications/${PLANNED_ID}/link`)[0]?.body).toEqual({ applicationId: null }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Link New Billing to a real application' }))
    const dialog = await screen.findByRole('dialog', { name: 'Link New Billing' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PUT /api/v1/trm/planned-applications/8b000000-0000-4000-8000-000000000002/link')[0]?.body).toBeDefined())
  })

  it('links a planned application to the real one', async () => {
    signInWith(MANAGE)
    api.on(`PUT /api/v1/trm/planned-applications/${PLANNED_ID}/link`, json(200, planned))
    renderRoute('/trm/roadmap')
    expect(await screen.findByRole('link', { name: 'New initiative' })).toHaveAttribute('href', '/trm/roadmap/new')
    await userEvent.click(await screen.findByRole('button', { name: 'Link New CRM to a real application' }))
    const dialog = await screen.findByRole('dialog', { name: 'Link New CRM' })
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Real application' }), 'CR')
    await userEvent.click(await screen.findByRole('option', { name: /^CRM/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo(`PUT /api/v1/trm/planned-applications/${PLANNED_ID}/link`)[0].body).toEqual({ applicationId: APP_CRM })
  })

  it('shows an initiative with its applications by action, cost and owner', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/trm/initiatives/${INITIATIVE_ID}`, json(200, initiative()))
    renderRoute(`/trm/roadmap/${INITIATIVE_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Modernise CRM' })).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText(/1,500,000\.00/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Onboarding' })).toHaveAttribute('href', `/trm/capabilities/${CAP_ONBOARDING}`)
    const introduce = screen.getByRole('region', { name: 'Introduce' })
    expect(introduce).toHaveTextContent('New CRMPlannednow CRM')
    const replace = screen.getByRole('region', { name: 'Replace' })
    expect(within(replace).getByRole('link', { name: 'Billing' })).toBeInTheDocument()
    expect(replace).toHaveTextContent('replaced by')
    expect(replace).toHaveTextContent('New Billing')
    expect(screen.getByRole('link', { name: 'Edit initiative' })).toHaveAttribute('href', `/trm/roadmap/${INITIATIVE_ID}/edit`)
  })

  it('shows Restricted for a hidden cost and owner, no edit without rights, and says when there are no applications', async () => {
    signInWith(READ)
    api.on(`GET /api/v1/trm/initiatives/${INITIATIVE_ID}`, json(200, initiative({ owner: null, estimatedCost: null, restricted: ['estimatedCost', 'owner'], canEdit: false, actions: [] })))
    renderRoute(`/trm/roadmap/${INITIATIVE_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Modernise CRM' })).toBeInTheDocument()
    expect(screen.getAllByText('Restricted')).toHaveLength(2)
    expect(screen.getByText('No applications yet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit initiative' })).not.toBeInTheDocument()
  })

  it('is shown to vendors whose role grants it, like anyone else', async () => {
    signInWith(READ, { isExternal: true })
    renderRoute('/trm/roadmap')
    expect(await screen.findByRole('link', { name: 'Modernise CRM' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'EA roadmap' }).length).toBeGreaterThan(0)
  })

  it('says when an initiative does not exist, and offers retries', async () => {
    signInWith(READ)
    api.on(`GET /api/v1/trm/initiatives/${INITIATIVE_ID}`, problem(404, 'Not Found'))
    renderRoute(`/trm/roadmap/${INITIATIVE_ID}`)
    expect(await screen.findByText('This initiative does not exist.')).toBeInTheDocument()
  })

  it('offers a retry when the list or the planned applications cannot be loaded', async () => {
    signInWith(READ)
    let fail = true
    api.on('GET /api/v1/trm/initiatives', () => (fail ? problem(500, 'Server error') : json(200, page([]))))
    api.on('GET /api/v1/trm/planned-applications', () => (fail ? problem(500, 'Server error') : json(200, { items: [] })))
    renderRoute('/trm/roadmap')
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(2))
    fail = false
    for (const retry of screen.getAllByRole('button', { name: 'Try again' })) await userEvent.click(retry)
    expect(await screen.findByText('No initiatives match')).toBeInTheDocument()
    expect(await screen.findByText('No planned applications')).toBeInTheDocument()
  })
})

describe('Initiative editor', () => {
  it('checks the form, then creates an initiative with planned and existing applications', async () => {
    signInWith(MANAGE)
    api.on('POST /api/v1/trm/initiatives', json(201, initiative()))
    api.on(`GET /api/v1/trm/initiatives/${INITIATIVE_ID}`, json(200, initiative()))
    const { here } = renderRoute('/trm/roadmap/new')

    expect(await screen.findByRole('heading', { level: 1, name: 'New initiative' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add an application' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    expect(screen.getByText('Choose a start date')).toBeInTheDocument()
    expect(screen.getByText('Choose an end date')).toBeInTheDocument()
    expect(screen.getByText('Choose the application, or name the planned one')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Modernise CRM')
    await userEvent.type(screen.getByRole('textbox', { name: 'Start date' }), '01012027')
    await userEvent.type(screen.getByRole('textbox', { name: 'End date' }), '30062028')
    await userEvent.type(screen.getByRole('textbox', { name: 'Estimated cost (MYR) (optional)' }), '1,500,000')
    await choose(document.body, 'Add a capability', '· Onboarding')
    expect(screen.getByRole('button', { name: 'Remove Onboarding' })).toBeInTheDocument()

    const first = screen.getByRole('group', { name: 'Application 1' })
    await userEvent.type(within(first).getByRole('textbox', { name: 'Planned application name' }), 'New CRM')

    await userEvent.click(screen.getByRole('button', { name: 'Add an application' }))
    const second = screen.getByRole('group', { name: 'Application 2' })
    await choose(second, 'What happens', 'Replace')
    await choose(second, 'Application', 'Existing application')
    await userEvent.type(within(second).getByRole('combobox', { name: 'Existing application' }), 'Bi')
    await userEvent.click(await screen.findByRole('option', { name: /Billing/ }))
    await choose(second, 'Replaced by', 'Planned application (not in ServiceNow yet)')
    await userEvent.type(within(second).getByRole('textbox', { name: 'Planned replacement name' }), 'New Billing')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(here()).toBe(`/trm/roadmap/${INITIATIVE_ID}`))
    expect(api.callsTo('POST /api/v1/trm/initiatives')[0].body).toEqual({
      name: 'Modernise CRM',
      description: null,
      rationale: null,
      startDate: '2027-01-01',
      endDate: '2028-06-30',
      status: 'proposed',
      ownerId: null,
      estimatedCost: '1500000',
      capabilityIds: [CAP_ONBOARDING],
      actions: [
        { action: 'introduce', plannedApplicationName: 'New CRM' },
        { action: 'replace', applicationId: APP_BILLING, replacementPlannedName: 'New Billing' },
      ],
    })
  })

  it('saves an initiative without a cost, replacing an application with an existing one', async () => {
    signInWith(MANAGE)
    api.on('POST /api/v1/trm/initiatives', json(201, initiative()))
    api.on(`GET /api/v1/trm/initiatives/${INITIATIVE_ID}`, json(200, initiative()))
    const { here } = renderRoute('/trm/roadmap/new')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'Swap billing')
    await userEvent.type(screen.getByRole('textbox', { name: 'Start date' }), '01012027')
    await userEvent.type(screen.getByRole('textbox', { name: 'End date' }), '30062028')
    await userEvent.click(screen.getByRole('button', { name: 'Add an application' }))
    const first = screen.getByRole('group', { name: 'Application 1' })
    await choose(first, 'What happens', 'Replace')
    await choose(first, 'Application', 'Existing application')
    await userEvent.type(within(first).getByRole('combobox', { name: 'Existing application' }), 'Bi')
    await userEvent.click(await screen.findByRole('option', { name: /Billing/ }))
    await choose(first, 'Replaced by', 'Existing application')
    await userEvent.type(within(first).getByRole('combobox', { name: 'Replacement application' }), 'CR')
    await userEvent.click(await screen.findByRole('option', { name: /^CRM/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(here()).toBe(`/trm/roadmap/${INITIATIVE_ID}`))
    expect(api.callsTo('POST /api/v1/trm/initiatives')[0].body).toMatchObject({ estimatedCost: null, actions: [{ action: 'replace', applicationId: APP_BILLING, replacementApplicationId: APP_CRM }] })
  })

  it('goes back to the roadmap, or to the initiative, when editing is cancelled', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/trm/initiatives/${INITIATIVE_ID}`, json(200, initiative()))
    const { here } = renderRoute('/trm/roadmap/new')
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(here()).toBe('/trm/roadmap'))
    cleanup()
    const edit = renderRoute(`/trm/roadmap/${INITIATIVE_ID}/edit`)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(edit.here()).toBe(`/trm/roadmap/${INITIATIVE_ID}`))
  })

  it('refuses a bad cost and an end before the start, and needs a replacement for a replacement', async () => {
    signInWith(MANAGE)
    renderRoute('/trm/roadmap/new')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Name' }), 'X')
    await userEvent.type(screen.getByRole('textbox', { name: 'Start date' }), '01012028')
    await userEvent.type(screen.getByRole('textbox', { name: 'End date' }), '01012027')
    await userEvent.type(screen.getByRole('textbox', { name: 'Estimated cost (MYR) (optional)' }), '12.345')
    await userEvent.click(screen.getByRole('button', { name: 'Add an application' }))
    const first = screen.getByRole('group', { name: 'Application 1' })
    await choose(first, 'What happens', 'Replace')
    await userEvent.type(within(first).getByRole('textbox', { name: 'Planned application name' }), 'Old thing')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter an amount in MYR, with up to 2 decimals')).toBeInTheDocument()
    expect(screen.getByText('Choose the replacement, or name the planned one')).toBeInTheDocument()
    expect(api.callsTo('POST /api/v1/trm/initiatives')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Remove application 1' }))
    expect(screen.queryByRole('group', { name: 'Application 1' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('edits an initiative, sending its version, and shows refusals', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/trm/initiatives/${INITIATIVE_ID}`, json(200, initiative()))
    api.on(`PUT /api/v1/trm/initiatives/${INITIATIVE_ID}`, problem(409, 'Conflict', 'Someone else changed this initiative'))
    renderRoute(`/trm/roadmap/${INITIATIVE_ID}/edit`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Edit Modernise CRM' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Modernise CRM')
    expect(screen.getAllByRole('group', { name: /^Application \d$/ })).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Onboarding' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Someone else changed this initiative')).toBeInTheDocument()
    expect(api.callsTo(`PUT /api/v1/trm/initiatives/${INITIATIVE_ID}`)[0].body).toMatchObject({
      version: 2,
      ownerId: ME_ID,
      estimatedCost: '1500000.00',
      capabilityIds: [],
      actions: [
        { action: 'introduce', plannedApplicationName: 'New CRM' },
        { action: 'replace', applicationId: APP_BILLING, replacementPlannedName: 'New Billing' },
        { action: 'retire', applicationId: '80000000-0000-4000-8000-000000000003' },
      ],
    })
  })
})
