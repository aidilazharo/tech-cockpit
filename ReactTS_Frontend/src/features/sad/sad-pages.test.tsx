import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { ADA, APP_BILLING, APP_CRM, apiRow, CURRENT_ID, INSTANCE_ID, listItem, overview, retention, STANDARD_ID, template, version, VERSION_ID, diagramSlots } from './fixtures'
import { calls } from './calls/fixtures'
import { SAD_ANY } from './permissions'
import { SAD_SECTION_KEYS, type SadSectionKey, type SectionAnswers } from './schemas'

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  // No files under the diagrams unless a test says so.
  api.on(`GET /api/v1/sad/versions/${VERSION_ID}/uploads`, json(200, { items: [] }))
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/sad/template', json(200, template))
  api.on('GET /api/v1/sad/retention-standards', json(200, { items: retention }))
  signInWith(SAD_ANY)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, total: items.length })
const choose = async (label: string, option: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

/** Answers of every kind, per section. */
const ANSWERS: Partial<Record<SadSectionKey, SectionAnswers>> = {
  'application-details': { 'data-classification': { value: { selected: 'confidential' } }, icfr: { value: { answer: 'no' } } },
  'solution-integration': {
    'solution-overview': {
      value: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Front Door', marks: [{ type: 'bold' }] }, { type: 'hardBreak' }, { type: 'text', text: 'docs', marks: [{ type: 'italic' }, { type: 'link', attrs: { href: 'https://aia.com' } }] }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'App Service' }] }] }] },
          { type: 'orderedList', attrs: { start: 2 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SQL' }] }] }] },
        ],
      },
    },
    'hosting-location': { value: { selected: ['aia-azure', 'other'], other: 'Colo' } },
    accessibility: { notApplicable: true, reason: 'Batch only' },
    'vm-check-in': { value: { answer: 'yes', details: 'Agents installed' } },
  },
  resiliency: { 'dr-test-date': { value: '2026-09-15' } },
  'security-design': {
    'acacm-link': { value: [{ label: 'ACACM', url: 'https://aia.com/acacm' }, { url: 'https://aia.com/b' }] },
    'authentication-method': { value: { selected: 'okta-sso' } },
    'user-count': { value: 1200 },
    'security-scans': { value: [{ row: 'Veracode SAST & SCA scan', cells: { status: 'done', lastDate: '2026-09-30' } }] },
    'uses-apis': { value: { answer: 'yes' } },
  },
  'api-inventory': {
    apis: { value: [{ id: '70000000-0000-4000-8000-000000000001', cells: { name: 'Policy API', apiOwner: ADA, productionUrl: 'https://api.aia.com/policy', thirdParty: 'no', calls: 50, dependencies: { items: [{ id: APP_CRM, name: 'Billing' }], other: 'Mainframe' }, priority: 'critical', data: [{ object: 'Policy', attributes: 'policy number' }] } }] },
  },
  backup: { 'backup-schedule': { value: { rows: [{ standardId: STANDARD_ID, resourceName: 'sql-crm-prod', comment: 'Prod only' }] } } },
}

/** A complete answered version: every question type shows its answer. */
const answered = version({
  status: 'current',
  number: 1,
  draftOf: null,
  approvedAt: '2026-10-01T04:00:00.000Z',
  retention: [retention[0]],
  canSubmit: false,
  canCancel: false,
  hidden: ['internet-protection', 'api-auth'],
  trm: { ...version().trm!, restricted: ['businessOwner'], live: false },
  sections: SAD_SECTION_KEYS.map((key) => ({
    key,
    readable: key !== 'logging',
    editable: false,
    rowVersion: 1,
    answers: key === 'logging' ? null : (ANSWERS[key] ?? {}),
  })),
})

describe('SAD list', () => {
  it('lists applications with their SAD status, filtered in the URL', async () => {
    api.on(
      'GET /api/v1/sad/documents',
      json(
        200,
        page([
          listItem(),
          listItem({ applicationId: '80000000-0000-4000-8000-000000000009', name: 'HR', number: null, current: null, open: { versionId: VERSION_ID, status: 'in_approval' } }),
          listItem({ applicationId: '80000000-0000-4000-8000-000000000008', name: null, number: 'APM-9', current: null, open: { versionId: VERSION_ID, status: 'draft' } }),
        ]),
      ),
    )
    const { here } = renderRoute('/sad')
    const rows = within(await screen.findByRole('table', { name: 'Applications and their SADs' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('CRMAPM-1Version 1 · approved 1 Oct 2026—')
    expect(within(rows[1]).getByRole('link', { name: 'CRM' })).toHaveAttribute('href', `/sad/${APP_CRM}`)
    expect(rows[2]).toHaveTextContent('HR—No approved version yetIn approval')
    expect(rows[3]).toHaveTextContent('APM-9APM-9No approved version yetDraft')
    await choose('SAD status', 'Draft being written')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by application name or APM ID' }), 'crm')
    await waitFor(() => expect(here()).toBe('/sad?status=draft&q=crm'))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(here()).toBe('/sad'))
  })

  it('marks applications flagged for local authentication, the draft\'s flag as such, and filters them in the URL', async () => {
    api.on(
      'GET /api/v1/sad/documents',
      json(200, page([listItem({ localAuthentication: 'approved' }), listItem({ applicationId: '80000000-0000-4000-8000-000000000009', name: 'HR', number: null, current: null, open: { versionId: VERSION_ID, status: 'draft' }, localAuthentication: 'draft' })])),
    )
    const { here } = renderRoute('/sad')
    const rows = within(await screen.findByRole('table', { name: 'Applications and their SADs' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('CRMLocal authenticationAPM-1')
    expect(rows[2]).toHaveTextContent('HRLocal authentication (draft)')
    await choose('Authentication', 'Local authentication')
    await waitFor(() => expect(here()).toBe('/sad?authentication=local'))
    await waitFor(() => expect(api.callsTo('GET /api/v1/sad/documents').at(-1)?.path).toContain('authentication=local'))
  })

  it('pages through the list', async () => {
    api.on('GET /api/v1/sad/documents', json(200, { ...page([listItem()]), total: 60 }))
    const { here } = renderRoute('/sad')
    await userEvent.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(here()).toBe('/sad?page=2'))
  })

  it('offers a retry when the list cannot be loaded', async () => {
    let fail = true
    api.on('GET /api/v1/sad/documents', () => (fail ? problem(500, 'Server error') : json(200, page([listItem()]))))
    renderRoute('/sad')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByRole('link', { name: 'CRM' })).toBeInTheDocument()
  })
})

describe("An application's SAD", () => {
  it('shows the current version, the open draft and the history', async () => {
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview({ open: { ...overview().open!, approvalStatus: 'returned' } })))
    renderRoute(`/sad/${APP_CRM}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'SAD: CRM' })).toBeInTheDocument()
    expect(screen.getByText('Version 1, approved 1 Oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Read version 1' })).toHaveAttribute('href', `/sad/versions/${CURRENT_ID}`)
    expect(screen.getByText('Started by Ada Admin on 20 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText(/returned this draft for changes/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit the draft' })).toHaveAttribute('href', `/sad/versions/${VERSION_ID}/edit`)
    expect(screen.getByRole('link', { name: 'Version 1' })).toHaveAttribute('href', `/sad/versions/${CURRENT_ID}`)
    expect(screen.queryByText(/Local authentication/)).not.toBeInTheDocument()
  })

  it('says when the application does its own authentication', async () => {
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview({ localAuthentication: 'approved' })))
    renderRoute(`/sad/${APP_CRM}`)
    expect(await screen.findByText('Local authentication')).toBeInTheDocument()
  })

  it('shows a draft in approval, superseded versions, and no names to someone who may not see them', async () => {
    api.on(
      `GET /api/v1/sad/applications/${APP_CRM}`,
      json(
        200,
        overview({
          application: { id: APP_CRM, name: 'CRM', number: null },
          open: { ...overview().open!, status: 'in_approval', startedBy: null },
          history: [...overview().history, { versionId: VERSION_ID, number: 0, approvedAt: '2026-10-01T04:00:00.000Z', status: 'superseded' }],
        }),
      ),
    )
    renderRoute(`/sad/${APP_CRM}`)
    expect(await screen.findByText('Started on 20 Oct 2026')).toBeInTheDocument()
    expect(screen.getAllByText('In approval').length).toBeGreaterThan(0)
    expect(screen.getByText('Superseded')).toBeInTheDocument()
    expect(screen.queryByText(/APM ID/)).not.toBeInTheDocument()
  })

  it('starts the first version and opens it for editing', async () => {
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview({ current: null, open: null, history: [], canStartDraft: true })))
    api.on(`POST /api/v1/sad/applications/${APP_CRM}/drafts`, json(201, { id: VERSION_ID, status: 'draft', approvalInstanceId: null }))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    const { here } = renderRoute(`/sad/${APP_CRM}`)
    expect(await screen.findByText('No version has been approved yet.')).toBeInTheDocument()
    expect(screen.getByText('No draft is open.')).toBeInTheDocument()
    expect(screen.getByText('None yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start the first version' }))
    await waitFor(() => expect(here()).toBe(`/sad/versions/${VERSION_ID}/edit`))
  })

  it('offers the next version number, shows a refused start, and says when the SAD cannot be found', async () => {
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview({ open: null, canStartDraft: true })))
    api.on(`POST /api/v1/sad/applications/${APP_CRM}/drafts`, problem(409, 'Conflict', 'This SAD already has an open draft.'))
    renderRoute(`/sad/${APP_CRM}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Start version 2' }))
    expect(await screen.findByText('This SAD already has an open draft.')).toBeInTheDocument()
  })

  it('shows a refused start: someone who may no longer edit a section', async () => {
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview({ open: null, canStartDraft: true })))
    api.on(`POST /api/v1/sad/applications/${APP_CRM}/drafts`, problem(403, 'Forbidden', 'You cannot edit any section of this SAD.'))
    renderRoute(`/sad/${APP_CRM}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Start version 2' }))
    expect(await screen.findByText('You cannot edit any section of this SAD.')).toBeInTheDocument()
  })

  it('says when the SAD does not exist or cannot be viewed', async () => {
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, problem(404, 'Not Found'))
    renderRoute(`/sad/${APP_CRM}`)
    expect(await screen.findByText('This SAD does not exist, or you cannot view it.')).toBeInTheDocument()
  })
})

describe('A SAD version', () => {
  it('shows each readable section with every kind of answer, and only the questions that apply', async () => {
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, json(200, { ...answered, id: CURRENT_ID }))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    renderRoute(`/sad/versions/${CURRENT_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'CRM: Version 1' })).toBeInTheDocument()
    const solution = screen.getByRole('region', { name: 'Solution & Integration Architecture' })
    expect(within(solution).getByText('Front Door').tagName).toBe('STRONG')
    expect(within(solution).getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://aia.com')
    expect(solution).toHaveTextContent('AIA Azure, Other: Colo')
    expect(solution).toHaveTextContent('Does not apply: Batch only')
    expect(solution).toHaveTextContent('Yes — Agents installed')
    expect(within(solution).queryByText('Internet-facing protection')).not.toBeInTheDocument()
    expect(solution).toHaveTextContent('ITSR.016 Network Security Standard')
    const details = screen.getByRole('region', { name: 'Application Details' })
    expect(details).toHaveTextContent('Confidential')
    expect(details).toHaveTextContent('Restricted') // the business owner's name
    expect(details).toHaveTextContent('Group, Retail')
    expect(details).toHaveTextContent('ICFR ApplicationNo')
    expect(screen.getByRole('region', { name: 'High Availability and Resiliency Architecture' })).toHaveTextContent('15/09/2026')
    const security = screen.getByRole('region', { name: 'Security Architecture Design' })
    expect(within(security).getByRole('link', { name: 'https://aia.com/b' })).toBeInTheDocument()
    expect(security).toHaveTextContent('1200 users')
    expect(security).toHaveTextContent('Okta SSO')
    expect(security).toHaveTextContent('Veracode SAST & SCA scanDone30/09/2026')
    const apis = screen.getByRole('region', { name: 'API Inventory' })
    expect(apis).toHaveTextContent('Policy APIAda Adminhttps://api.aia.com/policy——No50Billing, MainframeCriticalPolicy: policy number')
    expect(screen.getByRole('region', { name: 'Environment Details' })).toHaveTextContent('CRM ProdProductionsrv-1PostgreSQL 15 (PostgreSQL: Standard)')
    // Resource names show at once; the standard's values once the retention list arrives.
    await waitFor(() => expect(screen.getByRole('region', { name: 'Backup Details and Architecture' })).toHaveTextContent('Database - MsSQL on VMFinancial Transactionsql-crm-prod8 Years'))
    expect(screen.getByRole('region', { name: 'Physical and Network Architecture' })).toHaveTextContent('Not answered yet')
    expect(screen.queryByRole('region', { name: 'Logging & Monitoring' })).not.toBeInTheDocument()
    expect(screen.getByText('Some sections are not shown: your role does not include them.')).toBeInTheDocument()
    expect(screen.getByText('TRM values as they were when this version was submitted.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('href', `/api/v1/sad/versions/${CURRENT_ID}/pdf`)
    expect(screen.getByRole('navigation', { name: 'Sections' })).not.toHaveTextContent('Logging')
    expect(screen.queryByRole('button', { name: 'Submit for approval' })).not.toBeInTheDocument()
  })

  it("shows a version's diagrams read-only, in the sections that show them", async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`, json(200, { items: diagramSlots(), apis: [] }))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const solution = await screen.findByRole('region', { name: 'Solution diagram' })
    expect(within(solution).queryByRole('button', { name: 'Add block' })).not.toBeInTheDocument()
    expect(within(solution).getByRole('table', { name: 'Logical communication matrix' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Solution diagram: Data flow view' })).toHaveTextContent('Drawn in “Solution & Integration Architecture”. Shown here read-only.')
    const infrastructure = screen.getByRole('region', { name: 'Infrastructure diagram: Integration view' })
    expect(within(infrastructure).getByText('Drawn in “Physical and Network Architecture”. Shown here read-only.')).toBeInTheDocument()
    expect(within(within(infrastructure).getByRole('table', { name: 'Boxes' })).getByRole('button', { name: 'CRM web' })).toBeInTheDocument()
  })

  it("lists, under the solution diagram only, the calls to the application that other applications' approved SADs describe", async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`, json(200, { items: diagramSlots(), apis: [] }))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}/calls`, json(200, { items: calls }))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const solution = await screen.findByRole('region', { name: 'Solution diagram' })
    const incoming = screen.getByRole('region', { name: 'Calls from other applications' })
    expect(solution.compareDocumentPosition(incoming) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(await within(incoming).findByRole('cell', { name: 'Customer Portal (APM-0005)' })).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: 'Calls from other applications' })).toHaveLength(1)
  })

  it("lists the files under a version's diagrams for download, without ways to change them", async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`, json(200, { items: diagramSlots(), apis: [] }))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    const file = { id: '90000000-0000-4000-8000-000000000001', slot: 'solution', diagramId: 'solution', name: 'design.pdf', type: 'pdf', size: 2048, scan: 'clean', uploadedBy: { id: ADA.id, name: 'Ada Admin' }, uploadedAt: '2026-10-24T02:00:00.000Z' }
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/uploads`, json(200, { items: [file] }))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const solution = await screen.findByRole('region', { name: 'Solution diagram' })
    expect(await within(solution).findByRole('link', { name: 'design.pdf' })).toHaveAttribute('href', `/api/v1/sad/versions/${VERSION_ID}/uploads/${file.id}/file`)
    expect(within(solution).queryByLabelText('Add a file')).not.toBeInTheDocument()
  })

  it('shows a diagram that does not apply, with no files to list', async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`, json(200, { items: [{ ...diagramSlots()[0], content: { notApplicable: true, reason: 'Batch only' } }, diagramSlots()[1]], apis: [] }))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/uploads`, json(200, { items: [] }))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const solution = await screen.findByRole('region', { name: 'Solution diagram' })
    expect(solution).toHaveTextContent('Does not apply: Batch only')
    expect(within(solution).queryByRole('table', { name: /^Files/ })).not.toBeInTheDocument()
  })

  it('submits a complete draft, comparing it with the current version first', async () => {
    let submitted = false
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, () => json(200, version({ completion: SAD_SECTION_KEYS.map((section) => ({ section, total: 1, answered: 1, missing: [] })), ...(submitted ? { status: 'in_approval', canSubmit: false, canCancel: false, approvalInstanceId: INSTANCE_ID, approvalStatus: 'in_progress' } : {}) })))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    api.on(`POST /api/v1/sad/versions/${VERSION_ID}/submit`, () => {
      submitted = true
      return json(200, { id: VERSION_ID, status: 'in_approval', approvalInstanceId: INSTANCE_ID })
    })
    renderRoute(`/sad/versions/${VERSION_ID}`)
    expect(await screen.findByText('Every question is answered: ready to submit')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Compare with version 1' })).toHaveAttribute('href', `/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    expect(screen.getByRole('link', { name: 'Edit the draft' })).toHaveAttribute('href', `/sad/versions/${VERSION_ID}/edit`)
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Submit Draft of version 2 for approval?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit for approval' }))
    expect(await screen.findByText('In approval')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Follow its approval in the Approval Centre' })).toHaveAttribute('href', `/approvals/${INSTANCE_ID}`)
  })

  it('shows why a submission is refused', async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version({ approvalStatus: 'returned', approvalInstanceId: INSTANCE_ID })))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    api.on(`POST /api/v1/sad/versions/${VERSION_ID}/submit`, problem(422, 'Unprocessable Entity', 'Answer every applicable question first: Network (2).'))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    expect(await screen.findByText(/returned this draft for changes/)).toBeInTheDocument()
    expect(screen.getByText('26 questions to answer')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('The approval continues from the step that returned it.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit for approval' }))
    expect(await within(dialog).findByText('Answer every applicable question first: Network (2).')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  })

  it('cancels a draft and returns to the SAD', async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview({ open: null })))
    api.on(`POST /api/v1/sad/versions/${VERSION_ID}/cancel`, json(200, { id: VERSION_ID, status: 'cancelled', approvalInstanceId: null }))
    const { here } = renderRoute(`/sad/versions/${VERSION_ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel the draft' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancel this draft?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel the draft' }))
    await waitFor(() => expect(here()).toBe(`/sad/${APP_CRM}`))
    expect(api.callsTo(`POST /api/v1/sad/versions/${VERSION_ID}/cancel`)).toHaveLength(1)
  })

  it.each([
    [403, 'Forbidden', 'Only the person who started the draft, or someone allowed to cancel any SAD draft, can cancel it.'],
    [409, 'Conflict', 'Only a draft can be cancelled. Withdraw the approval in the Approval Centre first.'],
  ])('shows a refused cancel (%i) and keeps the draft', async (status, title, detail) => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    api.on(`POST /api/v1/sad/versions/${VERSION_ID}/cancel`, problem(status, title, detail))
    const { here } = renderRoute(`/sad/versions/${VERSION_ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel the draft' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancel this draft?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel the draft' }))
    expect(await within(dialog).findByText(detail)).toBeInTheDocument()
    expect(here()).toBe(`/sad/versions/${VERSION_ID}`)
  })

  it('opens for an approver without SAD permissions, read-only, with every section', async () => {
    signInWith(['approvals:task:act'])
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version({ status: 'in_approval', asApprover: true, approvalInstanceId: INSTANCE_ID, namesHidden: true, canSubmit: false, canCancel: false, sections: version().sections.map((s) => ({ ...s, editable: false })) })))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    expect(await screen.findByText(/reviewing this version as an approver/)).toBeInTheDocument()
    expect(screen.getByText("People's names are hidden from you.")).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit the draft' })).not.toBeInTheDocument()
    expect(api.callsTo(`GET /api/v1/sad/applications/${APP_CRM}`)).toHaveLength(0)
    expect(api.callsTo('GET /api/v1/sad/retention-standards')).toHaveLength(0)
    // Back to their approval, not to the application's SAD page they cannot open.
    expect(screen.getByRole('link', { name: 'Back to the approval' })).toHaveAttribute('href', `/approvals/${INSTANCE_ID}`)
  })

  it('does not call a draft ready to submit when the reader cannot view every section, only that the viewable ones are answered', async () => {
    const answeredAll = (key: SadSectionKey) => ({ section: key, total: 2, answered: 2, missing: [] })
    const viewable = SAD_SECTION_KEYS.filter((key) => key !== 'logging')
    api.on(
      `GET /api/v1/sad/versions/${VERSION_ID}`,
      json(200, version({ completion: viewable.map(answeredAll), sections: version().sections.map((s) => (s.key === 'logging' ? { ...s, readable: false, editable: false, answers: null } : s)) })),
    )
    renderRoute(`/sad/versions/${VERSION_ID}`)
    expect(await screen.findByText('Every section you can view is answered. Sections you cannot view may still need answers.')).toBeInTheDocument()
  })

  it('flags a version whose section 5 says the application does its own authentication', async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version({ localAuthentication: true })))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    expect(await screen.findByText('Local authentication')).toBeInTheDocument()
  })

  it('shows the warning with an answer it applies to', async () => {
    const security = { 'api-session-timeout': { value: 60 }, 'api-refresh-token': { value: { answer: 'no' } } }
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version({ sections: version().sections.map((s) => (s.key === 'security-design' ? { ...s, answers: security } : s)) })))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const section = await screen.findByRole('region', { name: 'Security Architecture Design' })
    expect(within(section).getByText('The API session timeout is more than 15 minutes: there should be an API refresh token along with the access token.')).toBeInTheDocument()
  })

  it("shows the backup schedule's values the version keeps, without reading the standard list", async () => {
    signInWith(['approvals:task:act'])
    const backup = { 'backup-schedule': { value: { rows: [{ standardId: STANDARD_ID, resourceName: 'sql-crm-prod' }] } } }
    const kept = { ...retention[0], yearly: '7 Years' }
    api.on(
      `GET /api/v1/sad/versions/${VERSION_ID}`,
      json(200, version({ status: 'in_approval', asApprover: true, approvalInstanceId: INSTANCE_ID, canSubmit: false, canCancel: false, retention: [kept], sections: version().sections.map((s) => ({ ...s, editable: false, answers: s.key === 'backup' ? backup : s.answers })) })),
    )
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const schedule = await screen.findByRole('region', { name: 'Cloud services backup schedule' })
    expect(within(schedule).getAllByRole('row')[1]).toHaveTextContent('Database - MsSQL on VMFinancial Transactionsql-crm-prod7 Years12 months5 weeks7 days')
    expect(api.callsTo('GET /api/v1/sad/retention-standards')).toHaveLength(0)
  })

  it('lists the Version Control rows in date order: who did what, at which step, with the comment; hidden names as Restricted', async () => {
    const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T02:00:00.000Z`
    api.on(
      `GET /api/v1/sad/versions/${VERSION_ID}`,
      json(
        200,
        version({
          ...answered,
          number: 2,
          history: [
              { action: 'started', user: ADA, step: null, comment: null, at: at(1) },
              { action: 'submitted', user: ADA, step: null, comment: null, at: at(2) },
              { action: 'withdrawn', user: ADA, step: null, comment: null, at: at(3) },
              { action: 'submitted', user: ADA, step: null, comment: null, at: at(4) },
              { action: 'info_requested', user: null, step: 'Application manager', comment: 'Which region?', at: at(5) },
              { action: 'answered', user: ADA, step: 'Application manager', comment: 'Malaysia West', at: at(6) },
              { action: 'approved', user: null, step: 'Application manager', comment: null, at: at(7) },
              { action: 'returned', user: null, step: 'Solution architect', comment: 'Add the DR test date', at: at(8) },
              { action: 'resubmitted', user: ADA, step: null, comment: null, at: at(9) },
              { action: 'version_approved', user: null, step: null, comment: null, at: at(10) },
          ],
        }),
      ),
    )
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const table = await screen.findByRole('table', { name: 'Version control' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['User', 'Action', 'State', 'Comment', 'Date', 'Version'])
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)),
    ).toEqual([
      ['Ada Admin', 'Started draft', 'Draft', '', '1 Oct 2026', 'Version 2'],
      ['Ada Admin', 'Submitted', 'In approval', '', '2 Oct 2026', 'Version 2'],
      ['Ada Admin', 'Withdrawn', 'Draft', '', '3 Oct 2026', 'Version 2'],
      ['Ada Admin', 'Submitted', 'In approval', '', '4 Oct 2026', 'Version 2'],
      ['Restricted', 'Asked for information', 'Application manager', 'Which region?', '5 Oct 2026', 'Version 2'],
      ['Ada Admin', 'Answered', 'Application manager', 'Malaysia West', '6 Oct 2026', 'Version 2'],
      ['Restricted', 'Approved', 'Application manager', '', '7 Oct 2026', 'Version 2'],
      ['Restricted', 'Returned', 'Solution architect', 'Add the DR test date', '8 Oct 2026', 'Version 2'],
      ['Ada Admin', 'Resubmitted', 'In approval', '', '9 Oct 2026', 'Version 2'],
      ['', 'Version approved', 'Current', '', '10 Oct 2026', 'Version 2'],
    ])
  })

  it('says when a version cannot be found, and offers retries', async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, problem(404, 'Not Found'))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    expect(await screen.findByText('This SAD version does not exist, or you cannot view it.')).toBeInTheDocument()
  })

  it('offers a retry when the template cannot be loaded', async () => {
    let fail = true
    api.on('GET /api/v1/sad/template', () => (fail ? problem(500, 'Server error') : json(200, template)))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByRole('heading', { level: 1, name: 'CRM: Draft of version 2' })).toBeInTheDocument()
  })
})

describe('Diagrams that fail to load', () => {
  it('say so in the section, with a way to try again', async () => {
    let fail = true
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/diagrams`, () => (fail ? problem(500, 'Server error') : json(200, { items: diagramSlots(), apis: [] })))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const section = await screen.findByRole('region', { name: 'Solution & Integration Architecture' })
    const retry = await within(section).findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await within(section).findByRole('region', { name: 'Solution diagram' })).toBeInTheDocument()
  })
})

describe('Comparing versions', () => {
  beforeEach(() => {
    for (const id of [CURRENT_ID, VERSION_ID]) {
      api.on(`GET /api/v1/sad/versions/${id}/diagrams`, json(200, { items: diagramSlots(), apis: [] }))
      api.on(`GET /api/v1/sad/versions/${id}/uploads`, json(200, { items: [] }))
    }
  })

  it('shows, in each section that shows them, the diagrams that changed side by side with what changed', async () => {
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, json(200, { ...answered, id: CURRENT_ID }))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version({ sections: answered.sections, trm: answered.trm, hidden: answered.hidden })))
    const page = (boxes: object[], lines: object[] = []) => ({ id: 'solution', title: 'Solution diagram', sizing: 'auto', zones: [], boxes, lines })
    const slots = (solution: object) => diagramSlots().map((slot) => (slot.slot === 'solution' ? { ...slot, content: { diagrams: [solution] } } : slot))
    const agent = { id: 'agent', label: 'Agent', type: 'actor', x: 0, y: 0 }
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}/diagrams`, json(200, { items: slots(page([agent, { id: 'portal', label: 'Portal', type: 'part', x: 300, y: 0 }])), apis: [] }))
    api.on(
      `GET /api/v1/sad/versions/${VERSION_ID}/diagrams`,
      json(200, { items: slots(page([agent, { id: 'portal', label: 'Customer portal', type: 'part', x: 300, y: 0 }], [{ id: 'l1', from: 'agent', to: 'portal', calls: 'Portal UI' }])), apis: [] }),
    )
    const file = { id: 'ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1', slot: 'solution', diagramId: 'solution', name: 'Design.pdf', type: 'pdf', size: 100, scan: 'clean', uploadedBy: null, uploadedAt: '2026-10-24T01:00:00Z' }
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/uploads`, json(200, { items: [file] }))
    renderRoute(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    const solution = await screen.findByRole('region', { name: 'Solution diagram' })
    expect(within(solution).getByRole('region', { name: 'Solution diagram in Version 1' })).toBeInTheDocument()
    expect(within(solution).getByRole('region', { name: 'Solution diagram in Draft of version 2' })).toBeInTheDocument()
    const changes = within(within(solution).getByRole('table', { name: 'Changes (3)' })).getAllByRole('row').slice(1)
    expect(changes.map((row) => row.textContent)).toEqual([
      'ChangedBlock: Customer portalName: PortalName: Customer portal',
      'AddedConnection: Agent → Customer portal—From → To: Agent → Customer portalWhat it calls: Portal UIWhat it does: —Direction: One-way',
      'AddedFile: Design.pdf—Design.pdf (PDF, 100 B)',
    ])
    // Section 9 shows its own view of the same diagram; the unchanged infrastructure diagram is not shown anywhere.
    expect(screen.getByRole('region', { name: 'Solution diagram: Data flow view' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Data Architecture & Data Flow' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Infrastructure diagram/ })).not.toBeInTheDocument()
    expect(screen.queryByText('No differences in the sections you can view.')).not.toBeInTheDocument()
  })

  it("refuses to compare versions of two applications' SADs", async () => {
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, json(200, { ...answered, id: CURRENT_ID }))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version({ application: { id: APP_BILLING, name: 'Billing', number: 'APM-2' } })))
    renderRoute(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    expect(await screen.findByText("These versions belong to two applications' SADs: compare versions of one SAD.")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: /compared with/ })).not.toBeInTheDocument()
  })

  it('says the version is not found when the link does not name both versions', async () => {
    renderRoute(`/sad/compare?from=${CURRENT_ID}`)
    expect(await screen.findByText('This SAD version does not exist, or you cannot view it.')).toBeInTheDocument()
  })

  it('offers a retry when the diagrams fail to load', async () => {
    let fail = true
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, json(200, { ...answered, id: CURRENT_ID }))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, { ...answered, id: VERSION_ID }))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}/uploads`, () => (fail ? problem(500, 'Server error') : json(200, { items: [] })))
    renderRoute(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No differences in the sections you can view.')).toBeInTheDocument()
  })

  it("shows an approved version's answers to questions later templates removed, marked so", async () => {
    const matrix = { value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Web to API on 443' }] }] } }
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version({ ...answered, sections: answered.sections.map((s) => (s.key === 'solution-integration' ? { ...s, answers: { ...s.answers, 'communication-matrix': matrix } } : s)) })))
    renderRoute(`/sad/versions/${VERSION_ID}`)
    const section = await screen.findByRole('region', { name: 'Solution & Integration Architecture' })
    const removed = within(section).getByText('Source and destination communication matrix').closest('div')!
    expect(removed).toHaveTextContent('No longer asked')
    expect(removed).toHaveTextContent('Web to API on 443')
  })

  it('lists answers to questions later templates removed among the changes, marked so', async () => {
    const matrix = { value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Web to API on 443' }] }] } }
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, json(200, { ...answered, id: CURRENT_ID, sections: answered.sections.map((s) => (s.key === 'solution-integration' ? { ...s, answers: { ...s.answers, 'communication-matrix': matrix } } : s)) }))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version({ sections: answered.sections, trm: answered.trm, hidden: answered.hidden })))
    renderRoute(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    const solution = await screen.findByRole('table', { name: 'Changes in Solution & Integration Architecture' })
    expect(within(solution).getAllByRole('row')[1]).toHaveTextContent('Source and destination communication matrix No longer askedWeb to API on 443Not answered yet')
  })

  it('lists, per section, the questions whose answer changed', async () => {
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, json(200, { ...answered, id: CURRENT_ID }))
    api.on(
      `GET /api/v1/sad/versions/${VERSION_ID}`,
      json(
        200,
        version({
          sections: answered.sections.map((s) => (s.key === 'security-design' ? { ...s, answers: { ...s.answers, 'user-count': { value: 1500 } } } : s)),
          trm: { ...answered.trm!, values: { ...answered.trm!.values, portfolios: ['Group'] } },
          hidden: answered.hidden,
        }),
      ),
    )
    renderRoute(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Version 1 compared with Draft of version 2' })).toBeInTheDocument()
    const security = screen.getByRole('table', { name: 'Changes in Security Architecture Design' })
    expect(within(security).getAllByRole('row')[1]).toHaveTextContent('Number of users1200 users1500 users')
    expect(screen.getByRole('table', { name: 'Changes in Application Details' })).toHaveTextContent('PortfolioGroup, RetailGroup')
    expect(screen.queryByRole('table', { name: 'Changes in Solution & Integration Architecture' })).not.toBeInTheDocument()
  })

  it('says when nothing changed, and when a version is missing', async () => {
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, json(200, { ...answered, id: CURRENT_ID }))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, { ...answered, id: VERSION_ID }))
    renderRoute(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    expect(await screen.findByText('No differences in the sections you can view.')).toBeInTheDocument()
  })

  it('says when a version cannot be found, and retries a failed load', async () => {
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, problem(404, 'Not Found'))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, version()))
    renderRoute(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    expect(await screen.findByText('This SAD version does not exist, or you cannot view it.')).toBeInTheDocument()
  })

  it('offers a retry when a version fails to load', async () => {
    let fail = true
    api.on(`GET /api/v1/sad/versions/${CURRENT_ID}`, () => (fail ? problem(500, 'Server error') : json(200, { ...answered, id: CURRENT_ID })))
    api.on(`GET /api/v1/sad/versions/${VERSION_ID}`, json(200, { ...answered, id: VERSION_ID }))
    renderRoute(`/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No differences in the sections you can view.')).toBeInTheDocument()
  })
})

describe('API inventory', () => {
  it('lists every API with labels from the template, filtered in the URL', async () => {
    api.on(
      'GET /api/v1/sad/apis',
      json(
        200,
        page([
          apiRow(),
          apiRow({ id: '8f000000-0000-4000-8000-000000000002', name: 'Batch API', description: null, productionUrl: null, apiOwner: null, priority: null, thirdParty: null, classification: 'unlisted', namesHidden: true }),
          apiRow({ id: '8f000000-0000-4000-8000-000000000003', name: 'Rates API', priority: 'high', thirdParty: true, uatUrl: 'https://uat.aia.com/rates', devUrl: 'https://dev.aia.com/rates', apiOwner: { name: 'Rates vendor desk' } }),
        ]),
      ),
    )
    const { here } = renderRoute('/sad/apis')
    const rows = within(await screen.findByRole('table', { name: 'APIs' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Policy APIPolicies for agentsProduction: https://api.aia.com/policyCRMProductionconfidentialCriticalNoAda Admin')
    expect(rows[2]).toHaveTextContent('Batch APICRM—unlisted——Restricted')
    expect(rows[3]).toHaveTextContent('Production, UAT, DEV')
    expect(rows[3]).toHaveTextContent('HighYesRates vendor desk')
    await choose('Priority', 'Critical')
    await choose('Third-party API', 'Yes')
    await choose('Environment', 'UAT')
    await waitFor(() => expect(here()).toBe('/sad/apis?priority=critical&thirdParty=yes&environment=uat'))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(here()).toBe('/sad/apis'))
  })

  it('filters by application, found among the SADs the reader may view', async () => {
    api.on('GET /api/v1/sad/apis', json(200, page([apiRow()])))
    api.on('GET /api/v1/sad/documents', json(200, page([listItem()])))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, overview()))
    const { here } = renderRoute('/sad/apis')
    await userEvent.type(await screen.findByRole('combobox', { name: 'Application' }), 'CR')
    await userEvent.click(await screen.findByRole('option', { name: /CRM/ }))
    await waitFor(() => expect(here()).toBe(`/sad/apis?applicationId=${APP_CRM}`))
    expect(api.callsTo('GET /api/v1/sad/apis').at(-1)!.path).toContain(`applicationId=${APP_CRM}`)
    expect(await screen.findByRole('combobox', { name: 'Application' })).toHaveValue('CRM')
  })

  it('searches and pages the inventory', async () => {
    api.on('GET /api/v1/sad/apis', json(200, { ...page([apiRow()]), total: 60 }))
    const { here } = renderRoute('/sad/apis')
    await userEvent.type(await screen.findByRole('searchbox'), 'policy')
    await waitFor(() => expect(here()).toBe('/sad/apis?q=policy'))
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(here()).toBe('/sad/apis?q=policy&page=2'))
  })

  it('offers a retry when the inventory cannot be loaded', async () => {
    let fail = true
    api.on('GET /api/v1/sad/apis', () => (fail ? problem(500, 'Server error') : json(200, page([]))))
    renderRoute('/sad/apis')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No APIs match')).toBeInTheDocument()
  })
})

describe('SAD pages for someone without the permissions', () => {
  it.each([
    ['the SAD list', '/sad', ['trm:application:read']],
    ['the API inventory', '/sad/apis', ['sad:network:read']],
    ['a version', `/sad/versions/${VERSION_ID}`, ['trm:application:read']],
    ['the editor, to a reader', `/sad/versions/${VERSION_ID}/edit`, ['sad:network:read']],
    ['the compare page', `/sad/compare?from=${CURRENT_ID}&to=${VERSION_ID}`, ['trm:application:read']],
  ])('refuses %s', async (_, path, permissions) => {
    signInWith(permissions)
    renderRoute(path)
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })
})
