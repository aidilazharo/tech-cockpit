import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../../test/harness'
import type { ClassifiedField } from '../schemas'

const MANAGE = ['access:field-class:manage']
const field = (overrides: Partial<ClassifiedField>): ClassifiedField => ({
  key: 'trm.application.licenceCost',
  module: 'trm',
  label: 'Application: licence cost',
  dataClass: 'financial',
  defaultClass: 'financial',
  ...overrides,
})
const FIELDS = [
  field({}),
  field({ key: 'trm.application.itApplicationOwner', label: 'Application: IT application owner', dataClass: 'internal', defaultClass: 'personal' }),
  field({ key: 'sad.api-people', module: 'sad', label: 'API owners and business owners (API inventory)', dataClass: 'personal', defaultClass: 'personal' }),
  field({ key: 'approvals.sad-version.applicationId', module: 'approvals', label: 'SAD version: applicationId' }),
]

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/field-classes', json(200, { items: FIELDS }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Field classification', () => {
  it('lists the fields by module with their class and default', async () => {
    signInWith(MANAGE)
    renderRoute('/admin/field-classes')

    expect(await screen.findByRole('heading', { level: 1, name: 'Field classification' })).toBeInTheDocument()
    const trm = await screen.findByRole('region', { name: 'Technology Reference Model (TRM)' })
    expect(within(trm).getByRole('combobox', { name: 'Application: licence cost' })).toHaveTextContent('Financial data')
    expect(within(trm).getByRole('combobox', { name: 'Application: IT application owner' })).toHaveTextContent('Internal')
    expect(trm).toHaveTextContent('Changed from the default: Staff personal data')
    expect(screen.getByRole('region', { name: 'Solution Architecture Documents (SAD)' })).toHaveTextContent('API owners and business owners')
    expect(screen.getByRole('region', { name: 'Approvals' })).toHaveTextContent('SAD version: applicationId')
    expect(within(trm).getAllByRole('button', { name: /Back to the default/ })).toHaveLength(1)
  })

  it('changes a class at once, and goes back to the default', async () => {
    signInWith(MANAGE)
    api.on('PUT /api/v1/field-classes/trm.application.licenceCost', (call) => json(200, field({ dataClass: (call.body as { dataClass: 'internal' }).dataClass })))
    api.on('PUT /api/v1/field-classes/trm.application.itApplicationOwner', json(200, field({ key: 'trm.application.itApplicationOwner', dataClass: 'personal', defaultClass: 'personal' })))
    renderRoute('/admin/field-classes')

    await userEvent.click(await screen.findByRole('combobox', { name: 'Application: licence cost' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Internal' }))
    await waitFor(() => expect(api.callsTo('PUT /api/v1/field-classes/trm.application.licenceCost')[0]?.body).toEqual({ dataClass: 'internal' }))
    expect(await screen.findByText('Application: licence cost is now Internal.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Back to the default for Application: IT application owner' }))
    await waitFor(() => expect(api.callsTo('PUT /api/v1/field-classes/trm.application.itApplicationOwner')[0]?.body).toEqual({ dataClass: null }))
  })

  it('shows why a change was refused', async () => {
    signInWith(MANAGE)
    api.on('PUT /api/v1/field-classes/trm.application.licenceCost', problem(403, 'Forbidden', 'You cannot classify fields.'))
    renderRoute('/admin/field-classes')
    await userEvent.click(await screen.findByRole('combobox', { name: 'Application: licence cost' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Contract terms' }))
    expect(await screen.findByText('You cannot classify fields.')).toBeInTheDocument()
  })

  it('offers a retry when the list cannot load', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/field-classes', problem(500, 'Internal Server Error'))
    renderRoute('/admin/field-classes')
    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/field-classes', json(200, { items: FIELDS }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('combobox', { name: 'Application: licence cost' })).toBeInTheDocument()
  })

  it('is refused without the permission', async () => {
    signInWith(['access:user:read'])
    renderRoute('/admin/field-classes')
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })
})
