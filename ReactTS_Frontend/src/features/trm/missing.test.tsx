import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { MISSING_BILLING, MISSING_CRM, MISSING_HR, missingRecord, missingSummary, page } from './fixtures'
import type { DeleteMissingResult, MissingRecord, RecordType } from './schemas'

const SUMMARY = 'GET /api/v1/trm/missing-records/summary'
const LIST = 'GET /api/v1/trm/missing-records'
const DELETE = 'POST /api/v1/trm/missing-records/delete'
const PATH = '/admin/trm-missing'

let api: ReturnType<typeof mockApi>

const crm = missingRecord()
const billing = missingRecord({ id: MISSING_BILLING, number: 'APM-11', name: 'Billing', snSysId: 'sys-billing', blockers: ['has-sad-history', 'open-approval'] })
const unnamed = missingRecord({ id: MISSING_HR, number: 'APM-12', name: null, snSysId: 'sys-hr' })

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  signInWith(['trm:synced-record:delete'])
})

/** Serves the summary and list from `rows`, and lets a delete remove what it names. */
function serve(rows: MissingRecord[], counts: Partial<Record<RecordType, number>> = { applications: rows.length }, result?: (ids: string[]) => DeleteMissingResult) {
  let remaining = rows
  api.on(SUMMARY, () => json(200, missingSummary(remaining.length === rows.length ? counts : { applications: remaining.length })))
  api.on(LIST, () => json(200, page(remaining)))
  api.on(DELETE, (call) => {
    const { ids } = call.body as { ids: string[] }
    const outcome = result?.(ids) ?? { deleted: ids, refused: [] }
    remaining = remaining.filter((row) => !outcome.deleted.includes(row.id))
    return json(200, outcome)
  })
}

const removeSelected = (count: number) => screen.getByRole('button', { name: `Remove selected (${count})` })

describe('Records missing from ServiceNow', () => {
  it('is only for people who may remove synced records', async () => {
    signInWith(['trm:sync:run'])
    renderRoute(PATH)
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
    expect(api.callsTo(SUMMARY)).toHaveLength(0)
  })

  it('lists the missing records and what stops each one being removed', async () => {
    serve([crm, billing, unnamed], { applications: 3, services: 2 })
    renderRoute(PATH)

    expect(await screen.findByRole('heading', { level: 1, name: 'Records missing from ServiceNow' })).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: 'Record type' })).toHaveTextContent('Applications (3)')
    expect(await screen.findByText('3 records are missing from ServiceNow')).toBeInTheDocument()
    expect(api.callsTo(LIST)[0].path).toContain('recordType=applications')

    const table = screen.getByRole('table', { name: 'Records missing from ServiceNow' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Name',
      'Number',
      'ServiceNow ID',
      'Not in the export since',
      'Can it be removed?',
    ])
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Legacy CRM')
    expect(rows[1]).toHaveTextContent('APM-10')
    expect(rows[1]).toHaveTextContent('sys-crm')
    expect(rows[1]).toHaveTextContent(/30 Sep/)
    expect(rows[1]).toHaveTextContent('Can be removed')
    expect(rows[2]).toHaveTextContent('Cannot be removed')
    expect(rows[2]).toHaveTextContent('Has a solution architecture document (SAD) that is not cancelled')
    expect(rows[2]).toHaveTextContent('Has an approval still running')
    expect(screen.getByRole('checkbox', { name: 'Legacy CRM' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('checkbox', { name: '(no name)' })).toBeInTheDocument()
    expect(removeSelected(0)).toBeDisabled()
  })

  it('opens on the first record type that has missing records', async () => {
    serve([missingRecord({ recordType: 'services' })], { services: 1, servers: 4 })
    renderRoute(PATH)
    expect(await screen.findByRole('combobox', { name: 'Record type' })).toHaveTextContent('Services (1)')
    await waitFor(() => expect(api.callsTo(LIST)[0].path).toContain('recordType=services'))
  })

  it('says so when nothing is missing', async () => {
    api.on(SUMMARY, json(200, missingSummary()))
    renderRoute(PATH)
    expect(await screen.findByText('Every record is in the latest ServiceNow export, so there is nothing to remove.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(api.callsTo(LIST)).toHaveLength(0)
  })

  it('switches record type and hides the columns that type does not have', async () => {
    serve([crm], { applications: 1, servers: 2 })
    renderRoute(PATH)
    await screen.findByRole('table', { name: 'Records missing from ServiceNow' })

    api.on(LIST, json(200, page([missingRecord({ recordType: 'servers', name: 'srv-01', number: null, snSysId: null })])))
    await userEvent.click(screen.getByRole('combobox', { name: 'Record type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Servers (2)' }))

    expect(await screen.findByRole('checkbox', { name: 'srv-01' })).toBeInTheDocument()
    expect(api.callsTo(LIST).at(-1)!.path).toContain('recordType=servers')
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Name', 'Not in the export since', 'Can it be removed?'])
  })

  it('shows the number but not the ServiceNow ID column in the shapes each type has', async () => {
    serve([missingRecord({ recordType: 'capabilities', number: null })], { capabilities: 1 })
    renderRoute(PATH)
    await screen.findByRole('table', { name: 'Records missing from ServiceNow' })
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Name', 'ServiceNow ID', 'Not in the export since', 'Can it be removed?'])
  })

  it('searches by name or number', async () => {
    serve([crm, billing], { applications: 2 })
    renderRoute(PATH)
    await screen.findByRole('table', { name: 'Records missing from ServiceNow' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name or number' }), 'crm')
    await waitFor(() => expect(api.callsTo(LIST).at(-1)!.path).toContain('q=crm'))
  })

  it('says when a search matches nothing', async () => {
    serve([], { applications: 2 })
    renderRoute(`${PATH}?q=zzz`)
    expect(await screen.findByText('No record matches your search')).toBeInTheDocument()
  })

  it('pages through the records', async () => {
    api.on(SUMMARY, json(200, missingSummary({ applications: 60 })))
    api.on(LIST, json(200, { ...page([crm]), total: 60 }))
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(api.callsTo(LIST).at(-1)!.path).toContain('page=2'))
  })

  it('selects every removable record on the page, and none of the others', async () => {
    serve([crm, billing, unnamed])
    renderRoute(PATH)
    const all = await screen.findByRole('checkbox', { name: 'Select all removable records on this page' })

    await userEvent.click(all)
    expect(screen.getByRole('checkbox', { name: 'Legacy CRM' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '(no name)' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Billing' })).not.toBeChecked()
    expect(removeSelected(2)).toBeEnabled()

    await userEvent.click(all)
    expect(screen.getByRole('checkbox', { name: 'Legacy CRM' })).not.toBeChecked()
    expect(removeSelected(0)).toBeDisabled()
  })

  it('has nothing to select all of when every record is blocked', async () => {
    serve([billing])
    renderRoute(PATH)
    expect(await screen.findByRole('checkbox', { name: 'Select all removable records on this page' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('selects and unselects single records', async () => {
    serve([crm, unnamed])
    renderRoute(PATH)
    const one = await screen.findByRole('checkbox', { name: 'Legacy CRM' })
    await userEvent.click(one)
    expect(removeSelected(1)).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Select all removable records on this page' })).not.toBeChecked()
    await userEvent.click(one)
    expect(removeSelected(0)).toBeDisabled()
  })

  it('removes the selected records after a confirmation, then refreshes the list and the counts', async () => {
    serve([crm, billing, unnamed], { applications: 3 })
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '(no name)' }))
    await userEvent.click(removeSelected(2))

    const dialog = await screen.findByRole('alertdialog', { name: 'Remove 2 records?' })
    expect(dialog).toHaveTextContent('for good')
    expect(api.callsTo(DELETE)).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('2 records removed')).toBeInTheDocument()
    expect(api.callsTo(DELETE)[0].body).toEqual({ recordType: 'applications', ids: [MISSING_CRM, MISSING_HR] })
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Legacy CRM' })).not.toBeInTheDocument())
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Record type' })).toHaveTextContent('Applications (1)')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(removeSelected(0)).toBeDisabled()
  })

  it('names one record singularly', async () => {
    serve([crm])
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(removeSelected(1))
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Remove 1 record?' })).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('1 record removed')).toBeInTheDocument()
  })

  it('removes nothing when the confirmation is cancelled', async () => {
    serve([crm])
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(removeSelected(1))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.callsTo(DELETE)).toHaveLength(0)
    expect(screen.getByRole('checkbox', { name: 'Legacy CRM' })).toBeChecked()
  })

  it('lists the records the API refused, with the reason', async () => {
    serve([crm, billing, unnamed], { applications: 3 }, (ids) => ({
      deleted: [MISSING_CRM],
      refused: ids.filter((id) => id !== MISSING_CRM).map((id) => ({ id, reason: 'not-missing' as const })),
    }))
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '(no name)' }))
    await userEvent.click(removeSelected(2))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('1 record removed')).toBeInTheDocument()
    expect(screen.getByText('These records were not removed')).toBeInTheDocument()
    expect(screen.getByText('(no name): Is back in the ServiceNow export')).toBeInTheDocument()
  })

  it('explains each reason a record can be refused', async () => {
    const reasons = ['has-sad-history', 'open-approval', 'used-by-initiative', 'has-children', 'not-found'] as const
    serve([crm], { applications: 1 }, () => ({ deleted: [], refused: reasons.map((reason) => ({ id: MISSING_CRM, reason })) }))
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(removeSelected(1))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))

    const list = await screen.findByRole('list', { name: 'These records were not removed' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Legacy CRM: Has a solution architecture document (SAD) that is not cancelled',
      'Legacy CRM: Has an approval still running',
      'Legacy CRM: Is used in an EA roadmap initiative',
      'Legacy CRM: Has sub-capabilities that are still in ServiceNow',
      'Legacy CRM: Was already removed',
    ])
    expect(screen.queryByText(/records? removed$/)).not.toBeInTheDocument()
  })

  it('shows why a removal failed in the dialog and keeps the selection', async () => {
    serve([crm])
    api.on(DELETE, problem(409, 'Conflict', 'A sync run is still receiving data. Complete or abandon it before removing records.'))
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(removeSelected(1))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    expect(await within(dialog).findByText('A sync run is still receiving data. Complete or abandon it before removing records.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByRole('checkbox', { name: 'Legacy CRM' })).toBeChecked()

    await userEvent.click(removeSelected(1))
    expect(within(await screen.findByRole('alertdialog')).queryByText(/still receiving data/)).not.toBeInTheDocument()
  })

  it('goes back a page when the last record on a later page is removed', async () => {
    let removed = false
    api.on(SUMMARY, () => json(200, missingSummary({ applications: removed ? 25 : 26 })))
    api.on(LIST, (call) => {
      const onSecond = call.path.includes('page=2')
      if (onSecond) return json(200, { ...page(removed ? [] : [crm]), page: 2, total: removed ? 25 : 26 })
      return json(200, { ...page([billing]), total: removed ? 25 : 26 })
    })
    api.on(DELETE, () => {
      removed = true
      return json(200, { deleted: [MISSING_CRM], refused: [] })
    })
    renderRoute(`${PATH}?page=2`)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(removeSelected(1))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('1 record removed')).toBeInTheDocument()
    await waitFor(() => expect(api.callsTo(LIST).at(-1)!.path).toContain('page=1'))
    expect(await screen.findByRole('checkbox', { name: 'Billing' })).toBeInTheDocument()
  })

  it('stays on the page when other records are left on it', async () => {
    serve([crm, unnamed])
    renderRoute(`${PATH}?page=2`)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(removeSelected(1))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('1 record removed')).toBeInTheDocument()
    expect(api.callsTo(LIST).every((call) => call.path.includes('page=2'))).toBe(true)
  })

  it('clears the selection when the record type changes', async () => {
    serve([crm], { applications: 1, services: 1 })
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    expect(removeSelected(1)).toBeEnabled()

    await userEvent.click(screen.getByRole('combobox', { name: 'Record type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Services (1)' }))
    await waitFor(() => expect(removeSelected(0)).toBeDisabled())
  })

  it('keeps the removal message after the last missing record is gone', async () => {
    api.on(SUMMARY, () => json(200, missingSummary({ applications: 1 })))
    api.on(LIST, json(200, page([crm])))
    api.on(DELETE, () => {
      api.on(SUMMARY, json(200, missingSummary()))
      return json(200, { deleted: [MISSING_CRM], refused: [] })
    })
    renderRoute(PATH)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Legacy CRM' }))
    await userEvent.click(removeSelected(1))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('1 record removed')).toBeInTheDocument()
    expect(await screen.findByText('Every record is in the latest ServiceNow export, so there is nothing to remove.')).toBeInTheDocument()
  })

  it('offers a retry when the counts or the list cannot be loaded', async () => {
    let failSummary = true
    api.on(SUMMARY, () => (failSummary ? problem(500, 'Server error') : json(200, missingSummary({ applications: 1 }))))
    let failList = true
    api.on(LIST, () => (failList ? problem(500, 'Server error') : json(200, page([crm]))))
    renderRoute(PATH)

    const retrySummary = await screen.findByRole('button', { name: 'Try again' })
    failSummary = false
    await userEvent.click(retrySummary)
    const retryList = await screen.findByRole('button', { name: 'Try again' })
    failList = false
    await userEvent.click(retryList)
    expect(await screen.findByRole('checkbox', { name: 'Legacy CRM' })).toBeInTheDocument()
  })

  it('explains that the permission must cover the whole organisation', async () => {
    api.on(SUMMARY, problem(403, 'Forbidden', 'Removing records needs this permission for the whole organisation, not for one department'))
    renderRoute(PATH)
    expect(await screen.findByText('Removing records needs the permission for the whole organisation, not for one department. Ask a system administrator.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})

describe('Records missing from ServiceNow in the navigation', () => {
  it('is offered to people who may remove synced records only', async () => {
    api.on(SUMMARY, json(200, missingSummary()))
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'Records missing from ServiceNow' })).toHaveAttribute('href', PATH)

    cleanup()
    vi.unstubAllGlobals()
    api = mockApi()
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
    signInWith(['trm:sync:run'])
    renderRoute('/')
    expect(await screen.findByRole('link', { name: 'TRM sync runs' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Records missing from ServiceNow' })).not.toBeInTheDocument()
  })
})
