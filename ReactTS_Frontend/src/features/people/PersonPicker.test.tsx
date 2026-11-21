import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactElement, useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { json, mockApi, signInWith } from '../../test/harness'
import { PersonPicker } from './PersonPicker'
import type { Person } from './schemas'

const BEA = { id: '72000000-0000-4000-8000-000000000077', name: 'Bea Backup', email: 'bea@aia.com', isExternal: false }

let api: ReturnType<typeof mockApi>
beforeEach(() => {
  api = mockApi()
})

const renderWithProviders = (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

function Picker({ actsForStaff }: { actsForStaff?: boolean }) {
  const [person, setPerson] = useState<Person | null>(null)
  return <PersonPicker label="Delegate" value={person} onChange={setPerson} actsForStaff={actsForStaff} />
}

describe('PersonPicker', () => {
  it('searches the directory, only for people who can act for staff when asked', async () => {
    signInWith(['people:directory:read'])
    api.on('GET /api/v1/people', json(200, { items: [BEA] }))
    renderWithProviders(<Picker actsForStaff />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Delegate' }), 'bea')
    await userEvent.click(await screen.findByRole('option', { name: /Bea Backup/ }))
    expect(api.callsTo('GET /api/v1/people').at(-1)!.path).toContain('actsForStaff=true')
  })

  it('anyone in the directory by default', async () => {
    signInWith(['people:directory:read'])
    api.on('GET /api/v1/people', json(200, { items: [BEA] }))
    renderWithProviders(<Picker />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Delegate' }), 'bea')
    expect(await screen.findByRole('option', { name: /Bea Backup/ })).toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/people').at(-1)!.path).not.toContain('actsForStaff')
  })

  it('is disabled, and says why, for roles that cannot search the directory', () => {
    signInWith([])
    renderWithProviders(<Picker />)
    expect(screen.getByRole('combobox', { name: 'Delegate' })).toBeDisabled()
    expect(screen.getByText('Your role cannot search the staff directory')).toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/people')).toHaveLength(0)
  })
})
