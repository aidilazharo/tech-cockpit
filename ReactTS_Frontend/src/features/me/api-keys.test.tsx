import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { apiKey } from '../admin/fixtures'

const TOKEN = 'tck_AbC123def456ghi7_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG'
let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on(
    'GET /api/v1/me/api-keys',
    json(200, {
      items: [
        apiKey(),
        apiKey({ id: '50000000-0000-4000-8000-000000000002', name: 'Old laptop', expiresAt: '2026-01-01T00:00:00.000Z', lastUsedAt: '2025-12-31T01:00:00.000Z' }),
        apiKey({ id: '50000000-0000-4000-8000-000000000003', name: 'Leaked', revokedAt: '2026-10-01T00:00:00.000Z' }),
      ],
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('My API keys', () => {
  it('lists keys by prefix only, with their status', async () => {
    signInWith(['apikey:own:manage'])
    renderRoute('/me/api-keys')

    const rows = within(await screen.findByRole('table', { name: 'Your API keys' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('tck_AbC123…')
    expect(rows[1]).toHaveTextContent('Never')
    expect(rows[1]).toHaveTextContent('Active')
    expect(rows[2]).toHaveTextContent('Expired')
    expect(rows[3]).toHaveTextContent('Revoked')
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument()
  })

  it('creates a key and shows the secret once, with copy', async () => {
    signInWith(['apikey:own:manage'])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    api.on('POST /api/v1/me/api-keys', json(201, { ...apiKey({ id: '50000000-0000-4000-8000-000000000004', name: 'CLI' }), token: TOKEN }))
    renderRoute('/me/api-keys')

    await userEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create API key' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create API key' }))
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'CLI')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Expires after' }))
    await userEvent.click(await screen.findByRole('option', { name: '90 days' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create API key' }))

    const shown = await screen.findByRole('alertdialog', { name: 'Copy your API key now' })
    expect(within(shown).getByRole('textbox', { name: 'API key' })).toHaveValue(TOKEN)
    // Focusing the key selects it, ready to copy by hand.
    const field = within(shown).getByRole('textbox', { name: 'API key' }) as HTMLInputElement
    field.focus()
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, TOKEN.length])
    expect(api.callsTo('POST /api/v1/me/api-keys')[0].body).toEqual({ name: 'CLI', expiresInDays: 90 })
    await userEvent.click(within(shown).getByRole('button', { name: 'Copy key' }))
    expect(writeText).toHaveBeenCalledWith(TOKEN)
    expect(await within(shown).findByText('Copied to the clipboard')).toBeInTheDocument()

    await userEvent.click(within(shown).getByRole('button', { name: 'I have stored it' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument()
  })

  it('shows why a key could not be created', async () => {
    signInWith(['apikey:own:manage'])
    api.on('POST /api/v1/me/api-keys', problem(409, 'Conflict', 'You already have 10 active API keys. Revoke one first.'))
    renderRoute('/me/api-keys')

    await userEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'One too many')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create API key' }))

    expect(await within(dialog).findByText('You already have 10 active API keys. Revoke one first.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('cancels creating a key', async () => {
    signInWith(['apikey:own:manage'])
    renderRoute('/me/api-keys')

    await userEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/me/api-keys')).toHaveLength(0)
  })

  it('closes the one-time key with Escape, never showing it again', async () => {
    signInWith(['apikey:own:manage'])
    api.on('POST /api/v1/me/api-keys', json(201, { ...apiKey({ id: '50000000-0000-4000-8000-000000000005', name: 'Esc' }), token: TOKEN }))
    renderRoute('/me/api-keys')

    await userEvent.click(await screen.findByRole('button', { name: 'Create API key' }))
    await userEvent.type(within(await screen.findByRole('dialog')).getByRole('textbox', { name: 'Name' }), 'Esc')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create API key' }))
    await screen.findByRole('alertdialog', { name: 'Copy your API key now' })
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.queryByDisplayValue(TOKEN)).not.toBeInTheDocument()
  })

  it('revokes a key after confirmation', async () => {
    signInWith(['apikey:own:manage'])
    api.on('POST /api/v1/me/api-keys/50000000-0000-4000-8000-000000000001/revoke', json(200, apiKey({ revokedAt: '2026-10-21T00:00:00.000Z' })))
    renderRoute('/me/api-keys')

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke ServiceNow sync' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Revoke ServiceNow sync?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/me/api-keys/50000000-0000-4000-8000-000000000001/revoke')).toHaveLength(1)
  })

  it('can change its mind about revoking', async () => {
    signInWith(['apikey:own:manage'])
    renderRoute('/me/api-keys')

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke ServiceNow sync' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('refuses the page without apikey:own:manage', async () => {
    signInWith([])
    renderRoute('/me/api-keys')

    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })

  it('offers a retry when keys cannot load', async () => {
    signInWith(['apikey:own:manage'])
    api.on('GET /api/v1/me/api-keys', problem(500, 'Internal Server Error'))
    renderRoute('/me/api-keys')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/me/api-keys', json(200, { items: [] }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('You have no API keys')).toBeInTheDocument()
  })
})
