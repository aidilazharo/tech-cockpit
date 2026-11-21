import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, ME_ID, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { ALI, INSTANCE_ID, instance, myTask, SAM, TASK_ID, workflow } from './fixtures'
import type { Instance } from './schemas'

const APPROVER = ['approvals:task:act', 'approvals:instance:read', 'approvals:delegation:manage', 'people:directory:read']
const list = (items: unknown[], total = items.length) => json(200, { items, page: 1, pageSize: 25, total })

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Approval Centre', () => {
  it('shows what is waiting for me, with a count, and blocked tasks', async () => {
    signInWith(APPROVER)
    api.on('GET /api/v1/approval-tasks', json(200, { items: [myTask(), myTask({ taskId: '71000000-0000-4000-8000-000000000009', status: 'blocked' })] }))
    renderRoute('/approvals')

    const rows = within(await screen.findByRole('table', { name: 'Waiting for me' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('CRM upgrade')
    expect(rows[1]).toHaveTextContent('Business case')
    expect(rows[1]).toHaveTextContent('Sam Submitter')
    expect(rows[1]).toHaveTextContent('Waiting for decision')
    expect(rows[2]).toHaveTextContent('Waiting for a linked approval')
    expect(screen.getByLabelText('2 waiting')).toBeInTheDocument()
    expect(within(rows[1]).getByRole('link', { name: 'CRM upgrade' })).toHaveAttribute('href', `/approvals/${INSTANCE_ID}`)
  })

  it('lists my requests, all approvals with filters, and my decisions', async () => {
    signInWith([...APPROVER, 'approvals:rule-set:read'])
    api.on('GET /api/v1/approval-tasks', json(200, { items: [] }))
    api.on('GET /api/v1/approval-workflows', json(200, { items: [workflow] }))
    api.on('GET /api/v1/approval-instances', (call) =>
      list([
        { id: INSTANCE_ID, workflowCode: 'business-case', workflowName: 'Business case', subjectType: 'bc', subjectId: '1', subjectTitle: call.path.includes('mine=true') ? 'Mine' : 'Everyone', status: 'returned', currentStepKey: 'review', submittedBy: SAM, createdAt: '2026-10-20T01:00:00.000Z' },
      ]),
    )
    api.on(
      'GET /api/v1/me/approval-decisions',
      list([
        { taskId: TASK_ID, decision: 'rejected', comment: 'Costs missing', actedAt: '2026-10-20T02:00:00.000Z', stepName: 'Review', round: 1, instance: { id: INSTANCE_ID, workflowCode: 'business-case', workflowName: 'Business case', subjectTitle: 'Decided item', status: 'returned', submittedBy: SAM } },
      ]),
    )
    const { here } = renderRoute('/approvals')

    expect(await screen.findByText('Nothing is waiting for you')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'My requests' }))
    expect(await screen.findByRole('link', { name: 'Mine' })).toBeInTheDocument()
    expect(here()).toBe('/approvals?view=mine')

    await userEvent.click(screen.getByRole('tab', { name: 'All approvals' }))
    expect(await screen.findByRole('link', { name: 'Everyone' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Returned' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Business case' }))
    await waitFor(() => expect(api.callsTo('GET /api/v1/approval-instances').at(-1)?.path).toContain('status=returned&workflowCode=business-case'))

    await userEvent.click(screen.getByRole('tab', { name: 'Done by me' }))
    const done = await screen.findByRole('table', { name: 'Done by me' })
    expect(done).toHaveTextContent('Decided item')
    expect(done).toHaveTextContent('Rejected')
    expect(done).toHaveTextContent('Costs missing')
  })

  it('shows only the views a requester without approver rights may use', async () => {
    signInWith(['approvals:instance:read'])
    api.on('GET /api/v1/approval-instances', list([]))
    renderRoute('/approvals?view=waiting')

    expect(await screen.findByRole('tab', { name: 'My requests' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /Waiting for me/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Done by me' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Out of office' })).not.toBeInTheDocument()
    expect(await screen.findByText('You have not submitted anything for approval')).toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/approval-tasks')).toHaveLength(0)
  })

  it('offers an approver who cannot follow approvals only their own tasks and decisions', async () => {
    signInWith(['approvals:task:act'])
    api.on('GET /api/v1/approval-tasks', json(200, { items: [] }))
    renderRoute('/approvals')
    expect(await screen.findByRole('tab', { name: /Waiting for me/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Done by me' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'My requests' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'All approvals' })).not.toBeInTheDocument()
  })

  it('refuses people without approval permissions', async () => {
    signInWith([])
    renderRoute('/approvals')

    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })

  it('offers retries when lists cannot load', async () => {
    signInWith(APPROVER)
    api.on('GET /api/v1/approval-tasks', problem(500, 'Internal Server Error'))
    api.on('GET /api/v1/approval-instances', problem(500, 'Internal Server Error'))
    api.on('GET /api/v1/me/approval-decisions', problem(500, 'Internal Server Error'))
    renderRoute('/approvals')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/approval-tasks', json(200, { items: [] }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Nothing is waiting for you')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'My requests' }))
    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/approval-instances', list([]))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('You have not submitted anything for approval')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Done by me' }))
    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/me/approval-decisions', list([]))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('alert', { name: 'Could not load this page' })).not.toBeInTheDocument())
  })

  it('opens out of office, and shows approved decisions without a comment', async () => {
    signInWith(APPROVER)
    api.on('GET /api/v1/approval-tasks', json(200, { items: [] }))
    api.on('GET /api/v1/me/delegations', json(200, { items: [] }))
    api.on(
      'GET /api/v1/me/approval-decisions',
      list([{ taskId: TASK_ID, decision: 'approved', comment: null, actedAt: '2026-10-20T02:00:00.000Z', stepName: 'Review', round: 1, instance: { id: INSTANCE_ID, workflowCode: 'business-case', workflowName: 'Business case', subjectTitle: 'Approved item', status: 'approved', submittedBy: SAM } }]),
    )
    const { here } = renderRoute('/approvals?view=done')
    const done = await screen.findByRole('table', { name: 'Done by me' })
    expect(done).toHaveTextContent('Approved')
    expect(done).toHaveTextContent('—')
    await userEvent.click(screen.getByRole('button', { name: 'Out of office' }))
    await waitFor(() => expect(here()).toBe('/approvals/out-of-office'))
  })
})

describe('Approval page', () => {
  const show = (data: Instance) => api.on(`GET /api/v1/approval-instances/${INSTANCE_ID}`, json(200, data))

  it('links a SAD approval to the version being approved, and nothing for other records', async () => {
    signInWith(APPROVER)
    show(instance({ subjectType: 'sad-version', subjectId: '8c000000-0000-4000-8000-000000000001' }))
    renderRoute(`/approvals/${INSTANCE_ID}`)
    expect(await screen.findByRole('link', { name: 'Open the SAD version' })).toHaveAttribute('href', '/sad/versions/8c000000-0000-4000-8000-000000000001')
  })

  it('shows the timeline, details and who it is waiting for, with restricted values', async () => {
    signInWith([...APPROVER, 'approvals:task:reassign'])
    show(
      instance({
        round: 2,
        steps: [
          { index: 0, key: 'review', name: 'Architecture review', status: 'approved' },
          { index: 1, key: 'finance', name: 'Finance sign-off', status: 'blocked' },
          { index: 2, key: 'exco', name: 'EXCO', status: 'waiting' },
        ],
        tasks: [
          { id: '71000000-0000-4000-8000-000000000003', stepKey: 'review', round: 1, status: 'rejected', assignee: ALI, originalAssignee: null, comment: 'Costs missing', response: null, actedAt: '2026-10-20T02:00:00.000Z', reassignReason: null },
          { id: '71000000-0000-4000-8000-000000000004', stepKey: 'review', round: 2, status: 'approved', assignee: ALI, originalAssignee: { id: 'x0000000-0000-4000-8000-000000000000'.replace('x', '7'), name: 'Bea Boss' }, comment: 'Which vendor?', response: 'Vendor A', actedAt: '2026-10-21T02:00:00.000Z', reassignReason: null },
          { id: '71000000-0000-4000-8000-000000000005', stepKey: 'finance', round: 2, status: 'blocked', assignee: SAM, originalAssignee: ALI, comment: null, response: null, actedAt: null, reassignReason: 'sla-escalation' },
          { id: '71000000-0000-4000-8000-000000000006', stepKey: 'finance', round: 2, status: 'pending', assignee: ALI, originalAssignee: SAM, comment: null, response: null, actedAt: null, reassignReason: 'On leave' },
        ],
        waitingOn: [ALI],
      }),
    )
    renderRoute(`/approvals/${INSTANCE_ID}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'CRM upgrade' })).toBeInTheDocument()
    expect(screen.getAllByText('Round 2').length).toBeGreaterThan(0)
    expect(screen.getByText('Restricted')).toBeInTheDocument()
    expect(screen.getByText('change')).toBeInTheDocument()
    expect(screen.getByText('Ali Approver', { selector: 'p, p *' })).toBeInTheDocument()
    const steps = within(screen.getByRole('region', { name: 'Steps' }).querySelector('ol') as HTMLElement).getAllByRole('listitem')
    expect(screen.getByRole('heading', { level: 3, name: 'Architecture review' }).closest('li')).toHaveTextContent('Costs missing')
    expect(steps[0]).toHaveTextContent('on behalf of Bea Boss')
    expect(steps[0]).toHaveTextContent('Question: Which vendor?')
    expect(steps[0]).toHaveTextContent('Answer: Vendor A')
    expect(screen.getByRole('heading', { level: 3, name: 'Finance sign-off' }).closest('li')).toHaveTextContent('Escalated because the time limit passed')
    expect(screen.getByRole('heading', { level: 3, name: 'Finance sign-off' }).closest('li')).toHaveTextContent('Reassigned: On leave')
    expect(screen.getByRole('heading', { level: 3, name: 'EXCO' }).closest('li')).toHaveTextContent('Not started')
    // Open and blocked tasks can be reassigned; decided ones cannot.
    expect(screen.getByRole('button', { name: "Reassign Sam Submitter's task" })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Reassign / })).toHaveLength(2)
  })

  it('approves with an optional comment', async () => {
    signInWith(APPROVER)
    show(instance())
    api.on(`POST /api/v1/approval-tasks/${TASK_ID}/approve`, json(200, instance({ status: 'approved', waitingOn: [] })))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve "CRM upgrade"?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo(`POST /api/v1/approval-tasks/${TASK_ID}/approve`)[0].body).toEqual({})
  })

  it('requires a reason to reject, and shows API refusals', async () => {
    signInWith(APPROVER)
    show(instance())
    api.on(`POST /api/v1/approval-tasks/${TASK_ID}/reject`, problem(409, 'Conflict', 'The task is approved'))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reject "CRM upgrade"?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))
    expect(within(dialog).getByText('Enter a reason')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Why are you rejecting it?' }), 'Costs missing')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(await within(dialog).findByText('The task is approved')).toBeInTheDocument()
    expect(api.callsTo(`POST /api/v1/approval-tasks/${TASK_ID}/reject`)[0].body).toEqual({ comment: 'Costs missing' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  })

  it('asks the requester a question', async () => {
    signInWith(APPROVER)
    show(instance())
    api.on(`POST /api/v1/approval-tasks/${TASK_ID}/request-info`, json(200, instance({ status: 'awaiting_info' })))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Ask a question' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ask the requester a question' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ask a question' }))
    expect(within(dialog).getByText('Enter your question')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Your question' }), 'Which vendor?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ask a question' }))

    await waitFor(() => expect(api.callsTo(`POST /api/v1/approval-tasks/${TASK_ID}/request-info`)[0]?.body).toEqual({ comment: 'Which vendor?' }))
  })

  it('tells an approver whose step waits for a linked approval', async () => {
    signInWith(APPROVER)
    show(instance({ tasks: [{ ...instance().tasks[0], status: 'blocked' }] }))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    expect(await screen.findByText(/waiting for a linked approval to finish first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('lets the requester answer a question', async () => {
    signInWith(APPROVER, { id: SAM.id })
    show(
      instance({
        status: 'awaiting_info',
        canActForSubmitter: true,
        tasks: [{ id: TASK_ID, stepKey: 'review', round: 1, status: 'info_requested', assignee: ALI, originalAssignee: null, comment: 'Which vendor?', response: null, actedAt: null, reassignReason: null }],
      }),
    )
    api.on(`POST /api/v1/approval-instances/${INSTANCE_ID}/respond-info`, json(200, instance()))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    expect(await screen.findByText('Ali Approver asked: Which vendor?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    expect(screen.getByText('Enter your answer')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Your answer' }), 'Vendor A')
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }))

    await waitFor(() => expect(api.callsTo(`POST /api/v1/approval-instances/${INSTANCE_ID}/respond-info`)[0]?.body).toEqual({ answer: 'Vendor A' }))
  })

  it('lets the requester resubmit a returned request, or cancel it', async () => {
    signInWith(APPROVER, { id: SAM.id })
    show(instance({ status: 'returned', tasks: [], canActForSubmitter: true }))
    api.on(`POST /api/v1/approval-instances/${INSTANCE_ID}/resubmit`, json(200, instance()))
    api.on(`POST /api/v1/approval-instances/${INSTANCE_ID}/cancel`, problem(409, 'Conflict', 'The approval is already approved'))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    expect(await screen.findByText(/Your request was returned/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Resubmit' }))
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Resubmit "CRM upgrade"?' })).getByRole('button', { name: 'Resubmit' }))
    await waitFor(() => expect(api.callsTo(`POST /api/v1/approval-instances/${INSTANCE_ID}/resubmit`)).toHaveLength(1))

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Cancel "CRM upgrade"?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel request' }))
    expect(await within(confirm).findByText('The approval is already approved')).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('lets someone allowed to act for submitters resubmit for the submitter', async () => {
    signInWith(APPROVER)
    show(instance({ status: 'returned', tasks: [], canActForSubmitter: true }))
    api.on(`POST /api/v1/approval-instances/${INSTANCE_ID}/resubmit`, json(200, instance()))
    renderRoute(`/approvals/${INSTANCE_ID}`)
    expect(await screen.findByRole('heading', { name: 'Request by Sam Submitter: you can act for them' })).toBeInTheDocument()
    expect(screen.getByText(/You can resubmit it for Sam Submitter/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Resubmit' }))
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Resubmit "CRM upgrade"?' })).getByRole('button', { name: 'Resubmit' }))
    await waitFor(() => expect(api.callsTo(`POST /api/v1/approval-instances/${INSTANCE_ID}/resubmit`)).toHaveLength(1))
  })

  it('offers no submitter actions to people who cannot act for the submitter', async () => {
    signInWith(APPROVER)
    show(instance({ status: 'returned', tasks: [], canActForSubmitter: false }))
    renderRoute(`/approvals/${INSTANCE_ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'CRM upgrade' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resubmit' })).not.toBeInTheDocument()
  })

  it('lets an administrator reassign an open task to someone else, with a reason', async () => {
    signInWith([...APPROVER, 'approvals:task:reassign'], { id: '72000000-0000-4000-8000-0000000000ff' })
    show(instance())
    api.on('GET /api/v1/people', json(200, { items: [{ id: '72000000-0000-4000-8000-000000000077', name: 'Bea Backup', email: 'bea@aia.com', isExternal: false }] }))
    api.on('POST /api/v1/approval-tasks/71000000-0000-4000-8000-000000000002/reassign', json(200, instance()))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: "Reassign Ali Approver's task" }))
    const dialog = await screen.findByRole('dialog', { name: "Reassign Ali Approver's task" })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }))
    expect(within(dialog).getByText('Choose the new approver')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter a reason (at least 3 characters)')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByRole('combobox', { name: 'New approver' }), 'b')
    expect(await screen.findByText('Type at least 2 letters')).toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/people')).toHaveLength(0)
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'New approver' }), 'ea')
    await userEvent.click(await screen.findByRole('option', { name: /Bea Backup/ }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason' }), 'Ali is on leave')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }))

    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/approval-tasks/71000000-0000-4000-8000-000000000002/reassign')[0]?.body).toEqual({
        toUserId: '72000000-0000-4000-8000-000000000077',
        reason: 'Ali is on leave',
      }),
    )
  })

  it('says when the approval does not exist, and retries other failures', async () => {
    signInWith(APPROVER)
    api.on(`GET /api/v1/approval-instances/${INSTANCE_ID}`, problem(404, 'Not Found'))
    renderRoute(`/approvals/${INSTANCE_ID}`)
    expect(await screen.findByText('This approval does not exist, or you cannot see it.')).toBeInTheDocument()
  })

  it('offers a retry when the approval cannot load', async () => {
    signInWith(APPROVER)
    api.on(`GET /api/v1/approval-instances/${INSTANCE_ID}`, problem(500, 'Internal Server Error'))
    renderRoute(`/approvals/${INSTANCE_ID}`)

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    show(instance({ context: {} }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'CRM upgrade' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Request details' })).not.toBeInTheDocument()
  })
})

describe('Out of office', () => {
  const delegation = {
    id: '74000000-0000-4000-8000-000000000001',
    toUser: ALI,
    startsAt: '2026-11-01T16:00:00.000Z',
    endsAt: '2026-11-06T16:00:00.000Z',
    reason: 'Annual leave',
    cancelledAt: null,
  }

  it('lists delegations with their first and last day, and cancels one', async () => {
    signInWith(APPROVER)
    api.on('GET /api/v1/me/delegations', json(200, { items: [delegation] }))
    api.on(`POST /api/v1/me/delegations/${delegation.id}/cancel`, json(200, { ...delegation, cancelledAt: '2026-10-21T00:00:00.000Z' }))
    renderRoute('/approvals/out-of-office')

    const rows = within(await screen.findByRole('table', { name: 'Your delegations' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ali Approver')
    expect(rows[1]).toHaveTextContent('2 Nov 2026')
    expect(rows[1]).toHaveTextContent('6 Nov 2026')
    expect(rows[1]).toHaveTextContent('Annual leave')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel the delegation to Ali Approver' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel delegation' }))

    await waitFor(() => expect(api.callsTo(`POST /api/v1/me/delegations/${delegation.id}/cancel`)).toHaveLength(1))
  })

  it('adds a delegation for whole days to someone who can act for staff, never to yourself', async () => {
    signInWith(APPROVER)
    api.on('GET /api/v1/me/delegations', json(200, { items: [] }))
    api.on(
      'GET /api/v1/people',
      json(200, {
        items: [
          { id: ME_ID, name: 'Ada Admin', email: 'admin@aia.com', isExternal: false },
          { id: ALI.id, name: 'Ali Approver', email: 'ali@aia.com', isExternal: false },
        ],
      }),
    )
    api.on('POST /api/v1/me/delegations', json(201, delegation))
    renderRoute('/approvals/out-of-office')

    expect(await screen.findByText('You have no current or upcoming delegations')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add delegation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add delegation' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add delegation' }))
    expect(within(dialog).getByText('Choose a delegate')).toBeInTheDocument()
    expect(within(dialog).getByText('Choose the last day')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Delegate' }), 'al')
    expect(await screen.findByRole('option', { name: /Ali Approver/ })).toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/people').at(-1)!.path).toContain('actsForStaff=true') // the API decides who can act for staff
    expect(screen.queryByRole('option', { name: /Ada Admin/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: /Ali Approver/ }))
    const first = within(dialog).getByRole('textbox', { name: 'First day' })
    await userEvent.clear(first)
    await userEvent.type(first, '02112099')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Last day' }), '01112099')
    expect(within(dialog).getByText('Choose a date on or after 02/11/2099')).toBeInTheDocument()
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Last day' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Last day' }), '06112099')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Reason (optional)' }), 'Annual leave')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add delegation' }))

    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/me/delegations')[0]?.body).toEqual({
        toUserId: ALI.id,
        startsAt: '2099-11-01T16:00:00.000Z',
        endsAt: '2099-11-06T16:00:00.000Z',
        reason: 'Annual leave',
      }),
    )
  })

  it('refuses a last day before the first day when the first day moves later', async () => {
    signInWith(APPROVER)
    api.on('GET /api/v1/me/delegations', json(200, { items: [] }))
    renderRoute('/approvals/out-of-office')
    await userEvent.click(await screen.findByRole('button', { name: 'Add delegation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add delegation' })
    const first = within(dialog).getByRole('textbox', { name: 'First day' })
    await userEvent.clear(first)
    await userEvent.type(first, '02112099')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Last day' }), '06112099')
    await userEvent.clear(first)
    await userEvent.type(first, '10112099')
    await userEvent.tab()
    expect(await within(dialog).findByText('The last day cannot be before the first day')).toBeInTheDocument()
  })

  it('offers a retry when delegations cannot load', async () => {
    signInWith(APPROVER)
    api.on('GET /api/v1/me/delegations', problem(500, 'Internal Server Error'))
    renderRoute('/approvals/out-of-office')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
  })
})

describe('Out of office for others', () => {
  const MANAGE_OTHERS = ['approvals:any-delegation:manage', 'people:directory:read']
  const SAM_PERSON = { ...SAM, email: 'sam@aia.com', isExternal: false }
  const ALI_PERSON = { ...ALI, email: 'ali@aia.com', isExternal: false }
  const delegation = { id: '74000000-0000-4000-8000-000000000002', toUser: ALI, startsAt: '2026-11-01T16:00:00.000Z', endsAt: '2026-11-06T16:00:00.000Z', reason: null, cancelledAt: null }

  it("lets holders of \"Manage others' delegations\" add and cancel someone's delegation", async () => {
    signInWith(MANAGE_OTHERS)
    api.on('GET /api/v1/people', (call) => json(200, { items: call.path.includes('actsForStaff=true') ? [SAM_PERSON, ALI_PERSON] : [SAM_PERSON] }))
    api.on('GET /api/v1/approval-delegations', json(200, { items: [delegation] }))
    api.on('POST /api/v1/approval-delegations', json(201, delegation))
    api.on(`POST /api/v1/approval-delegations/${delegation.id}/cancel`, json(200, { ...delegation, cancelledAt: '2026-10-23T00:00:00.000Z' }))
    renderRoute('/admin/out-of-office')

    expect(await screen.findByRole('heading', { level: 1, name: 'Out of office for others' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('combobox', { name: 'Whose approvals' }), 'sam')
    await userEvent.click(await screen.findByRole('option', { name: /Sam Submitter/ }))
    const rows = within(await screen.findByRole('table', { name: "Sam Submitter's delegations" })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ali Approver')
    expect(api.callsTo('GET /api/v1/approval-delegations').at(-1)!.path).toContain(`userId=${SAM.id}`)

    await userEvent.click(screen.getByRole('button', { name: 'Add delegation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add delegation for Sam Submitter' })
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Delegate' }), 'al')
    expect(await screen.findByRole('option', { name: /Ali Approver/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Sam Submitter/ })).not.toBeInTheDocument() // never to themselves
    await userEvent.click(screen.getByRole('option', { name: /Ali Approver/ }))
    const first = within(dialog).getByRole('textbox', { name: 'First day' })
    await userEvent.clear(first)
    await userEvent.type(first, '02112099')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Last day' }), '06112099')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add delegation' }))
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/approval-delegations')[0]?.body).toEqual({ fromUserId: SAM.id, toUserId: ALI.id, startsAt: '2099-11-01T16:00:00.000Z', endsAt: '2099-11-06T16:00:00.000Z' }),
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel the delegation to Ali Approver' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel delegation' }))
    await waitFor(() => expect(api.callsTo(`POST /api/v1/approval-delegations/${delegation.id}/cancel`)).toHaveLength(1))
  })

  it('is refused without the permission', async () => {
    signInWith(APPROVER)
    renderRoute('/admin/out-of-office')
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Out of office for others' })).not.toBeInTheDocument()
  })
})
