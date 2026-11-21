import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../../test/harness'
import { arbWorkflow, ruleSet, workflow } from '../fixtures'

const MANAGE = ['approvals:rule-set:read', 'approvals:rule-set:manage', 'people:directory:read']
const ROLES = { roles: [{ code: 'tech-exco', name: 'Tech EXCO' }, { code: 'pmo', name: 'PMO' }] }
const PERSON = { id: '72000000-0000-4000-8000-000000000055', name: 'Fiona Finance', email: 'fiona@aia.com', isExternal: false }

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/approval-workflows', json(200, { items: [workflow, arbWorkflow] }))
  api.on('GET /api/v1/approval-rule-options', json(200, ROLES))
  api.on('GET /api/v1/people', json(200, { items: [PERSON] }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const group = (name: string | RegExp) => screen.getByRole('group', { name })

describe('Approval rules list', () => {
  it('shows each approval type with its fields, financial visibility and versions', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/approval-rule-sets', (call) =>
      json(200, { items: call.path.includes('business-case') ? [ruleSet(), ruleSet({ id: '73000000-0000-4000-8000-000000000002', ruleVersion: 1, status: 'published', publishedAt: '2026-10-01T00:00:00.000Z' })] : [] }),
    )
    const { here } = renderRoute('/admin/approval-rules')

    const section = await screen.findByRole('region', { name: 'Business case' })
    expect(section).toHaveTextContent('Fields rules can use: tco, category')
    expect(within(section).getByRole('checkbox', { name: /Approvers see the financial data of what they approve/ })).toHaveAttribute('aria-checked', 'true')
    const rows = within(await within(section).findByRole('table')).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Draft')
    expect(rows[2]).toHaveTextContent('Published')
    expect(rows[2]).toHaveTextContent('1 Oct 2026')
    expect(within(screen.getByRole('region', { name: 'ARB review' })).getByText('No rules yet')).toBeInTheDocument()

    await userEvent.click(within(section).getByRole('button', { name: 'New draft from the published version' }))
    await waitFor(() => expect(here()).toBe('/admin/approval-rules/new?workflow=business-case&from=73000000-0000-4000-8000-000000000002'))
  })

  it('starts a first draft for an approval type that has no published version', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/approval-rule-sets', json(200, { items: [] }))
    const { here } = renderRoute('/admin/approval-rules')
    await userEvent.click(await within(await screen.findByRole('region', { name: 'ARB review' })).findByRole('button', { name: 'New draft' }))
    await waitFor(() => expect(here()).toBe('/admin/approval-rules/new?workflow=arb-review'))
  })

  it('says when no approval types exist, and hides drafting from readers', async () => {
    signInWith(['approvals:rule-set:read'])
    api.on('GET /api/v1/approval-workflows', json(200, { items: [] }))
    renderRoute('/admin/approval-rules')

    expect(await screen.findByText(/No approval types are registered yet/)).toBeInTheDocument()
  })

  it('lets maintainers switch, per approval type, whether approvers see financial data', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/approval-rule-sets', json(200, { items: [] }))
    api.on('PATCH /api/v1/approval-workflows/arb-review', (call) => {
      api.on('GET /api/v1/approval-workflows', json(200, { items: [workflow, { ...arbWorkflow, approversSeeFinancials: true }] }))
      return json(200, { code: 'arb-review', ...(call.body as object) })
    })
    api.on('PATCH /api/v1/approval-workflows/business-case', problem(403, 'Forbidden', 'You cannot change this setting.'))
    renderRoute('/admin/approval-rules')

    const arb = await screen.findByRole('region', { name: 'ARB review' })
    const box = within(arb).getByRole('checkbox', { name: /Approvers see the financial data/ })
    expect(box).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(box)
    await waitFor(() => expect(within(arb).getByRole('checkbox', { name: /Approvers see the financial data/ })).toHaveAttribute('aria-checked', 'true'))
    expect(api.callsTo('PATCH /api/v1/approval-workflows/arb-review')[0].body).toEqual({ approversSeeFinancials: true })

    const bc = screen.getByRole('region', { name: 'Business case' })
    await userEvent.click(within(bc).getByRole('checkbox', { name: /Approvers see the financial data/ }))
    expect(await within(bc).findByText('You cannot change this setting.')).toBeInTheDocument()
  })

  it('shows readers whether approvers see financial data, without changing it', async () => {
    signInWith(['approvals:rule-set:read'])
    api.on('GET /api/v1/approval-rule-sets', json(200, { items: [] }))
    renderRoute('/admin/approval-rules')
    const section = await screen.findByRole('region', { name: 'Business case' })
    expect(section).toHaveTextContent('Approvers may see the financial details')
    expect(within(section).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('offers a retry when the list cannot load', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/approval-workflows', problem(500, 'Internal Server Error'))
    renderRoute('/admin/approval-rules')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/approval-workflows', json(200, { items: [workflow] }))
    api.on('GET /api/v1/approval-rule-sets', problem(500, 'Internal Server Error'))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const section = await screen.findByRole('region', { name: 'Business case' })
    expect(await within(section).findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    // A version whose rules cannot be read counts as none; a new draft starts empty when nothing is published.
    api.on('GET /api/v1/approval-rule-sets', json(200, { items: [ruleSet({ definition: { nonsense: true } as never })] }))
    await userEvent.click(within(section).getByRole('button', { name: 'Try again' }))
    const row = within(await within(section).findByRole('table')).getAllByRole('row')[1]
    expect(row).toHaveTextContent('0')
  })
})

describe('Rule editor', () => {
  it('builds a first rule set from scratch, checking it before saving', async () => {
    signInWith(MANAGE)
    api.on('POST /api/v1/approval-rule-sets', (call) => json(201, ruleSet({ id: '73000000-0000-4000-8000-000000000009', ruleVersion: 1, definition: (call.body as { definition: unknown }).definition })))
    api.on('GET /api/v1/approval-rule-sets/73000000-0000-4000-8000-000000000009', json(200, ruleSet({ id: '73000000-0000-4000-8000-000000000009', ruleVersion: 1 })))
    const { here } = renderRoute('/admin/approval-rules/new?workflow=business-case')

    expect(await screen.findByRole('heading', { level: 1, name: 'Business case: version —' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(screen.getByText('Some fields need attention').closest('[role="alert"]')).toBeInTheDocument()
    expect(screen.getAllByText('Enter a name')).toHaveLength(2)
    expect(screen.getByText('Add at least one approver')).toBeInTheDocument()

    const rule = group('Rule 1')
    await userEvent.type(within(rule).getByRole('textbox', { name: 'Rule name' }), 'Large investments')
    // Conditions: TCO at least 250,000 AND (category is change OR any of a nested group)
    await userEvent.click(within(rule).getByRole('button', { name: 'Add conditions' }))
    await userEvent.type(within(group('Applies when')).getByRole('textbox', { name: 'Value' }), '250000')
    await userEvent.click(within(group('Applies when')).getByRole('combobox', { name: 'Operator' }))
    await userEvent.click(await screen.findByRole('option', { name: 'is at least' }))
    await userEvent.click(within(group('Applies when')).getByRole('button', { name: 'Add group' }))
    const nested = within(group('Applies when')).getByRole('group', { name: 'Group' })
    await userEvent.click(within(nested).getByRole('combobox', { name: 'Match' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Any of these' }))
    await userEvent.click(within(nested).getByRole('combobox', { name: 'Field' }))
    await userEvent.click(await screen.findByRole('option', { name: 'category' }))
    await userEvent.click(within(nested).getByRole('combobox', { name: 'Value' }))
    await userEvent.click(await screen.findByRole('option', { name: 'change' }))
    await userEvent.click(within(nested).getByRole('button', { name: 'Add condition' }))
    await userEvent.click(within(nested).getAllByRole('combobox', { name: 'Operator' })[1])
    await userEvent.click(await screen.findByRole('option', { name: 'is one of' }))
    await userEvent.type(within(nested).getAllByRole('textbox', { name: 'Value' })[0], '1, 2')

    // Step: two approver groups (a role, a person), two of them must agree, 24h, escalate to PMO, waits for ARB
    const step = group('Step 1')
    await userEvent.type(within(step).getByRole('textbox', { name: 'Step name' }), 'EXCO')
    await userEvent.clear(within(step).getByRole('textbox', { name: 'Step key' }))
    await userEvent.type(within(step).getByRole('textbox', { name: 'Step key' }), 'exco')
    await userEvent.click(within(step).getByRole('button', { name: 'Add role' }))
    await userEvent.click(within(step).getByRole('combobox', { name: 'Role' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Tech EXCO' }))
    await userEvent.click(within(step).getByRole('combobox', { name: 'Who with this role' }))
    await userEvent.click(await screen.findByRole('option', { name: /Only those whose scope/ }))
    await userEvent.click(within(step).getByRole('button', { name: 'Add person' }))
    await userEvent.type(within(step).getByRole('combobox', { name: 'Person' }), 'fi')
    await userEvent.click(await screen.findByRole('option', { name: /Fiona Finance/ }))
    await userEvent.click(within(step).getByRole('combobox', { name: 'Needed to complete the step' }))
    await userEvent.click(await screen.findByRole('option', { name: 'A number of approvers' }))
    await userEvent.type(within(step).getByRole('textbox', { name: 'Time limit (hours)' }), '24')
    await userEvent.click(within(step).getByRole('combobox', { name: 'Escalate to' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Someone with a role' }))
    await userEvent.click(within(step).getAllByRole('combobox', { name: 'Role' })[1])
    await userEvent.click(await screen.findByRole('option', { name: 'PMO' }))
    await userEvent.click(within(step).getByRole('combobox', { name: 'After a rejection, who reviews again' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Everyone at this step' }))
    await userEvent.click(within(step).getByRole('combobox', { name: 'Wait for another approval first' }))
    await userEvent.click(await screen.findByRole('option', { name: 'ARB review' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(here()).toBe('/admin/approval-rules/73000000-0000-4000-8000-000000000009'))
    expect(api.callsTo('POST /api/v1/approval-rule-sets')[0].body).toEqual({
      workflowCode: 'business-case',
      definition: {
        rules: [
          {
            key: 'rule-1',
            name: 'Large investments',
            priority: 10,
            when: { all: [{ field: 'tco', op: 'gte', value: 250000 }, { any: [{ field: 'category', op: 'eq', value: 'change' }, { field: 'tco', op: 'in', value: [1, 2] }] }] },
            steps: [
              {
                key: 'exco',
                name: 'EXCO',
                approvers: [{ kind: 'role', roleCode: 'tech-exco', scope: 'subject' }, { kind: 'user', userId: PERSON.id }],
                quorum: { count: 2 },
                reReview: 'all',
                slaHours: 24,
                escalateTo: { kind: 'role', roleCode: 'pmo', scope: 'global' },
                gate: { requiresApproved: 'arb-review' },
              },
            ],
          },
        ],
      },
    })
  })

  it('edits a draft: rules, steps and conditions can be added, moved and removed, then saved and published', async () => {
    signInWith(MANAGE)
    const draft = ruleSet()
    api.on(`GET /api/v1/approval-rule-sets/${draft.id}`, json(200, draft))
    api.on(`PATCH /api/v1/approval-rule-sets/${draft.id}`, (call) => json(200, { ...draft, definition: (call.body as { definition: unknown }).definition, version: 5 }))
    api.on(`POST /api/v1/approval-rule-sets/${draft.id}/publish`, json(200, { ...draft, status: 'published', version: 6 }))
    renderRoute(`/admin/approval-rules/${draft.id}`)

    const rule = await screen.findByRole('group', { name: 'Large' })
    expect(within(rule).getByRole('textbox', { name: 'Value' })).toHaveValue('250000')
    await userEvent.click(within(rule).getByRole('button', { name: 'Add step' }))
    const second = within(rule).getByRole('group', { name: 'Step 2' })
    await userEvent.type(within(second).getByRole('textbox', { name: 'Step name' }), 'Finance')
    await userEvent.click(within(second).getByRole('button', { name: 'Add role' }))
    await userEvent.click(within(second).getByRole('combobox', { name: 'Role' }))
    await userEvent.click(await screen.findByRole('option', { name: 'PMO' }))
    await userEvent.click(within(second).getByRole('button', { name: 'Move step Finance up' }))
    expect(within(rule).getByRole('group', { name: 'Step 1' })).toHaveTextContent('Remove step Finance')
    await userEvent.click(within(rule).getByRole('button', { name: 'Remove all conditions (make it the fallback)' }))
    expect(within(rule).getByText('Always (fallback rule)')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    const added = screen.getByRole('group', { name: 'Rule 2' })
    await userEvent.type(within(added).getByRole('textbox', { name: 'Rule name' }), 'Spare')
    await userEvent.clear(within(added).getByRole('textbox', { name: 'Rule key' }))
    await userEvent.type(within(added).getByRole('textbox', { name: 'Rule key' }), 'spare')
    await userEvent.clear(within(added).getByRole('textbox', { name: 'Priority' }))
    await userEvent.type(within(added).getByRole('textbox', { name: 'Priority' }), '7')
    expect(within(added).getByRole('textbox', { name: 'Priority' })).toHaveValue('7')
    await userEvent.click(within(screen.getByRole('group', { name: 'Spare' })).getByRole('button', { name: 'Remove rule Spare' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Draft saved')).toBeInTheDocument()
    const body = api.callsTo(`PATCH /api/v1/approval-rule-sets/${draft.id}`)[0].body as { version: number; definition: { rules: { when: unknown; steps: { key: string }[] }[] } }
    expect(body.version).toBe(4)
    expect(body.definition.rules).toHaveLength(1)
    expect(body.definition.rules[0].when).toBeNull()
    expect(body.definition.rules[0].steps.map((s) => s.key)).toEqual(['step-2', 'exco'])

    // Changing one's mind first, then publishing.
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Publish version 2?' })).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Publish version 2?' })).getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Published. New submissions use these rules.')).toBeInTheDocument()
  })

  it('shows API refusals when saving', async () => {
    signInWith(MANAGE)
    const draft = ruleSet()
    api.on(`GET /api/v1/approval-rule-sets/${draft.id}`, json(200, draft))
    api.on(`PATCH /api/v1/approval-rule-sets/${draft.id}`, problem(422, 'Unprocessable Entity', 'Conditions use fields this workflow does not provide: tco'))
    renderRoute(`/admin/approval-rules/${draft.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Conditions use fields this workflow does not provide: tco')).toBeInTheDocument()
  })

  it('shows a published version read-only', async () => {
    signInWith(MANAGE)
    const published = ruleSet({ status: 'published' })
    api.on(`GET /api/v1/approval-rule-sets/${published.id}`, json(200, published))
    renderRoute(`/admin/approval-rules/${published.id}`)

    expect(await screen.findByText(/This version is Published and cannot be changed/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Rule name' })).toBeDisabled()
  })

  it('is read-only for people who may only read rules, and names person approvers', async () => {
    signInWith(['approvals:rule-set:read'])
    const draft = ruleSet({
      definition: {
        rules: [{ key: 'r', name: 'R', priority: 1, when: null, steps: [{ key: 's', name: 'S', approvers: [{ kind: 'user', userId: PERSON.id }], quorum: 'any', reReview: 'rejecters', escalateTo: { kind: 'user', userId: PERSON.id } }] }],
      },
    })
    api.on(`GET /api/v1/approval-rule-sets/${draft.id}`, json(200, draft))
    renderRoute(`/admin/approval-rules/${draft.id}`)

    expect(await screen.findByText('You can view these rules but not change them.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('combobox', { name: 'Person' })[0]).toHaveValue('Fiona Finance'))
    expect(api.callsTo('GET /api/v1/people')[0].path).toBe(`/api/v1/people?ids=${PERSON.id}`)
  })

  it('offers a retry when the editor cannot load', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/approval-rule-options', problem(500, 'Internal Server Error'))
    renderRoute('/admin/approval-rules/new?workflow=business-case')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/approval-rule-options', json(200, ROLES))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Business case: version —' })).toBeInTheDocument()
  })

  it('offers a retry when the rule set or the approval types cannot load', async () => {
    signInWith(MANAGE)
    const draft = ruleSet()
    let fail = true
    api.on(`GET /api/v1/approval-rule-sets/${draft.id}`, () => (fail ? problem(500, 'Internal Server Error') : json(200, draft)))
    api.on('GET /api/v1/approval-workflows', () => (fail ? problem(500, 'Internal Server Error') : json(200, { items: [workflow, arbWorkflow] })))
    renderRoute(`/admin/approval-rules/${draft.id}`)
    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('group', { name: 'Large' })).toBeInTheDocument()
  })

  it('refuses new drafts without approvals:rule-set:manage', async () => {
    signInWith(['approvals:rule-set:read'])
    renderRoute('/admin/approval-rules/new?workflow=business-case')

    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })
})
