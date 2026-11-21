import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, renderRoute, signInWith } from '../../../test/harness'
import { ruleSet, workflow } from '../fixtures'
import type { Workflow } from '../schemas'

const MANAGE = ['approvals:rule-set:read', 'approvals:rule-set:manage', 'people:directory:read']
const PERSON = { id: '72000000-0000-4000-8000-000000000055', name: 'Fiona Finance', email: 'fiona@aia.com', isExternal: false }
const flagged: Workflow = { ...workflow, fields: [...workflow.fields, { path: 'urgent', type: 'boolean', values: null }, { path: 'notes', type: 'unknown', values: null }] }

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/approval-workflows', json(200, { items: [flagged] }))
  api.on('GET /api/v1/approval-rule-options', json(200, { roles: [{ code: 'pmo', name: 'PMO' }] }))
  api.on('GET /api/v1/people', json(200, { items: [PERSON] }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Rule editor details', () => {
  it('starts a new draft as a copy of the published version', async () => {
    signInWith(MANAGE)
    const published = ruleSet({ status: 'published' })
    api.on(`GET /api/v1/approval-rule-sets/${published.id}`, json(200, published))
    api.on('POST /api/v1/approval-rule-sets', json(201, ruleSet({ id: '73000000-0000-4000-8000-000000000008', ruleVersion: 3 })))
    api.on('GET /api/v1/approval-rule-sets/73000000-0000-4000-8000-000000000008', json(200, ruleSet({ id: '73000000-0000-4000-8000-000000000008', ruleVersion: 3 })))
    renderRoute(`/admin/approval-rules/new?workflow=business-case&from=${published.id}`)

    const rule = await screen.findByRole('group', { name: 'Large' })
    expect(within(rule).getByRole('textbox', { name: 'Value' })).toHaveValue('250000')
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(api.callsTo('POST /api/v1/approval-rule-sets')[0]?.body).toMatchObject({ workflowCode: 'business-case' }))
  })

  it('edits conditions: yes/no and "has a value", removing conditions and groups, up to the depth limit', async () => {
    signInWith(MANAGE)
    const draft = ruleSet({
      definition: {
        rules: [
          {
            key: 'r',
            name: 'R',
            priority: 1,
            when: { all: [{ field: 'urgent', op: 'eq', value: true }, { any: [{ all: [{ all: [{ all: [{ field: 'notes', op: 'eq', value: 'x' }] }] }] }] }] },
            steps: [{ key: 's', name: 'S', approvers: [{ kind: 'role', roleCode: 'pmo', scope: 'global' }], quorum: 'any', reReview: 'rejecters' }],
          },
        ],
      },
    })
    api.on(`GET /api/v1/approval-rule-sets/${draft.id}`, json(200, draft))
    api.on(`PATCH /api/v1/approval-rule-sets/${draft.id}`, (call) => json(200, { ...draft, definition: (call.body as { definition: unknown }).definition }))
    renderRoute(`/admin/approval-rules/${draft.id}`)

    const top = await screen.findByRole('group', { name: 'Applies when' })
    expect(within(top).getAllByRole('combobox', { name: 'Value' })[0]).toHaveTextContent('Yes')
    await userEvent.click(within(top).getAllByRole('combobox', { name: 'Value' })[0])
    await userEvent.click(await screen.findByRole('option', { name: 'No' }))
    expect(within(top).getByText('Groups can be nested at most 5 levels deep')).toBeInTheDocument()

    // Operator "has a value" hides the value; changing the field resets the condition.
    await userEvent.click(within(top).getAllByRole('combobox', { name: 'Operator' })[0])
    await userEvent.click(await screen.findByRole('option', { name: 'has a value' }))
    await userEvent.click(within(top).getAllByRole('combobox', { name: 'Field' })[0])
    await userEvent.click(await screen.findByRole('option', { name: 'urgent' }))
    await userEvent.click(within(top).getAllByRole('combobox', { name: 'Operator' })[0])
    await userEvent.click(await screen.findByRole('option', { name: 'has a value' }))
    await userEvent.click(within(top).getAllByRole('button', { name: 'Remove group' })[0])
    await userEvent.click(within(top).getByRole('button', { name: 'Add condition' }))
    await userEvent.click(within(top).getAllByRole('button', { name: 'Remove condition' })[1])
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() =>
      expect((api.callsTo(`PATCH /api/v1/approval-rule-sets/${draft.id}`)[0]?.body as { definition: { rules: { when: unknown }[] } }).definition.rules[0].when).toEqual({
        all: [{ field: 'urgent', op: 'exists' }],
      }),
    )
  })

  it('reports an empty group, and edits steps: approvers, escalation to a person, time limit and order', async () => {
    signInWith(MANAGE)
    const draft = ruleSet({
      definition: {
        rules: [
          {
            key: 'r',
            name: 'R',
            priority: 1,
            when: { all: [{ any: [{ field: 'tco', op: 'gt', value: 1 }] }] },
            steps: [
              { key: 'a', name: 'A', approvers: [{ kind: 'role', roleCode: 'pmo', scope: 'global' }, { kind: 'role', roleCode: 'pmo', scope: 'subject' }], quorum: { count: 2 }, slaHours: 8, reReview: 'rejecters', gate: { requiresApproved: 'arb-review' }, escalateTo: { kind: 'role', roleCode: 'pmo', scope: 'global' } },
              { key: 'b', name: 'B', approvers: [{ kind: 'role', roleCode: 'pmo', scope: 'global' }], quorum: 'any', reReview: 'rejecters' },
            ],
          },
        ],
      },
    })
    api.on(`GET /api/v1/approval-rule-sets/${draft.id}`, json(200, draft))
    api.on(`PATCH /api/v1/approval-rule-sets/${draft.id}`, (call) => json(200, { ...draft, definition: (call.body as { definition: unknown }).definition }))
    renderRoute(`/admin/approval-rules/${draft.id}`)

    const nested = await screen.findByRole('group', { name: 'Group' })
    await userEvent.click(within(nested).getByRole('button', { name: 'Remove condition' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(screen.getByText('Add at least one condition, or remove the group')).toBeInTheDocument()
    await userEvent.click(within(nested).getByRole('button', { name: 'Remove group' }))
    // An empty top group is not allowed either: make the rule the fallback.
    await userEvent.click(screen.getByRole('button', { name: 'Remove all conditions (make it the fallback)' }))

    const first = screen.getByRole('group', { name: 'Step 1' })
    await userEvent.click(within(first).getByRole('button', { name: 'Remove approver 2' }))
    const count = within(first).getByRole('textbox', { name: 'How many' })
    await userEvent.clear(count)
    await userEvent.type(count, '1')
    await userEvent.clear(within(first).getByRole('textbox', { name: 'Time limit (hours)' }))
    await userEvent.click(within(first).getByRole('combobox', { name: 'Wait for another approval first' }))
    await userEvent.click(await screen.findByRole('option', { name: 'No' }))
    await userEvent.click(within(first).getByRole('combobox', { name: 'Escalate to' }))
    await userEvent.click(await screen.findByRole('option', { name: 'A specific person' }))
    await userEvent.type(within(first).getByRole('combobox', { name: 'Person' }), 'fi')
    await userEvent.click(await screen.findByRole('option', { name: /Fiona Finance/ }))
    await userEvent.click(within(first).getByRole('button', { name: 'Move step A down' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Step 1' })).getByRole('button', { name: 'Remove step B' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() =>
      expect((api.callsTo(`PATCH /api/v1/approval-rule-sets/${draft.id}`)[0]?.body as { definition: { rules: { steps: unknown[] }[] } }).definition.rules[0].steps).toEqual([
        { key: 'a', name: 'A', approvers: [{ kind: 'role', roleCode: 'pmo', scope: 'global' }], quorum: { count: 1 }, reReview: 'rejecters', escalateTo: { kind: 'user', userId: PERSON.id } },
      ]),
    )
    // Clearing the person leaves the step without one until another is chosen.
    const step = screen.getByRole('group', { name: 'Step 1' })
    await userEvent.clear(within(step).getByRole('combobox', { name: 'Person' }))
    expect(within(step).getByRole('combobox', { name: 'Person' })).toHaveValue('')
    await userEvent.click(within(step).getByRole('combobox', { name: 'Needed to complete the step' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Every approver' }))
    expect(within(step).queryByRole('textbox', { name: 'How many' })).not.toBeInTheDocument()
    await userEvent.click(within(step).getByRole('combobox', { name: 'Needed to complete the step' }))
    await userEvent.click(await screen.findByRole('option', { name: 'A number of approvers' }))
    expect(within(step).getByRole('textbox', { name: 'How many' })).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('group', { name: 'Step 1' })).getByRole('combobox', { name: 'Escalate to' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Nobody (no escalation)' }))
    expect(within(screen.getByRole('group', { name: 'Step 1' })).queryByRole('combobox', { name: 'Person' })).not.toBeInTheDocument()
  })
})
