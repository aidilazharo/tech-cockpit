import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from './support/a11y'
import { mockApi } from './support/mock-api'

const ME = { id: '00000000-0000-4000-8000-000000000001', name: 'Ada Admin' }
const SAM = { id: '72000000-0000-4000-8000-000000000002', name: 'Sam Submitter' }
const INSTANCE = '70000000-0000-4000-8000-000000000001'
const TASK = '71000000-0000-4000-8000-000000000001'

function instance(status = 'in_progress', taskStatus = 'pending') {
  return {
    id: INSTANCE,
    workflowCode: 'business-case',
    workflowName: 'Business case',
    subjectType: 'business-case',
    subjectId: 'bc-1',
    subjectTitle: 'CRM upgrade',
    status,
    round: 1,
    ruleKey: 'standard',
    submittedBy: SAM,
    context: { tco: null, category: 'change' },
    canActForSubmitter: false,
    currentStep: status === 'approved' ? null : { index: 0, key: 'review', name: 'Architecture review' },
    steps: [{ index: 0, key: 'review', name: 'Architecture review', status: status === 'approved' ? 'approved' : 'active' }],
    tasks: [{ id: TASK, stepKey: 'review', round: 1, status: taskStatus, assignee: ME, originalAssignee: null, comment: taskStatus === 'approved' ? 'Looks good' : null, response: null, actedAt: null, reassignReason: null }],
    waitingOn: status === 'approved' ? [] : [ME],
    createdAt: '2026-10-20T01:00:00.000Z',
    completedAt: null,
  }
}

const notification = {
  id: '60000000-0000-4000-8000-000000000001',
  type: 'approval.task.assigned',
  params: { subjectTitle: 'CRM upgrade', workflow: 'Business case', step: 'Architecture review', onBehalfOf: null },
  link: `/approvals/${INSTANCE}`,
  readAt: null,
  createdAt: '2026-10-21T02:00:00.000Z',
}

test('an approver gets notified, opens the item and approves it', async ({ page }) => {
  let decided = false
  const calls = await mockApi(page, ['approvals:task:act', 'approvals:instance:read', 'approvals:delegation:manage'], {
    'GET /api/v1/me/notifications/unread-count': () => ({ status: 200, body: { unread: decided ? 0 : 1 } }),
    'GET /api/v1/me/notifications': { status: 200, body: { items: [notification], page: 1, pageSize: 8, total: 1, unread: 1 } },
    [`POST /api/v1/me/notifications/${notification.id}/read`]: { status: 200, body: { ...notification, readAt: '2026-10-21T03:00:00.000Z' } },
    'GET /api/v1/approval-tasks': () => ({
      status: 200,
      body: { items: decided ? [] : [{ taskId: TASK, status: 'pending', stepKey: 'review', stepName: 'Architecture review', round: 1, createdAt: '2026-10-20T01:00:00.000Z', instance: { id: INSTANCE, workflowCode: 'business-case', workflowName: 'Business case', subjectType: 'business-case', subjectId: 'bc-1', subjectTitle: 'CRM upgrade', status: 'in_progress', submittedBy: SAM } }] },
    }),
    [`GET /api/v1/approval-instances/${INSTANCE}`]: () => ({ status: 200, body: decided ? instance('approved', 'approved') : instance() }),
    [`POST /api/v1/approval-tasks/${TASK}/approve`]: () => {
      decided = true
      return { status: 200, body: instance('approved', 'approved') }
    },
  })
  await page.goto('/')

  const bell = page.getByRole('button', { name: 'Notifications, 1 unread' })
  await bell.click()
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: /CRM upgrade/ }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'CRM upgrade' })).toBeVisible()
  await expect(page.getByText('Restricted')).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Approve' }).click()
  const dialog = page.getByRole('dialog', { name: 'Approve "CRM upgrade"?' })
  await dialog.getByRole('textbox', { name: 'Comment (optional)' }).fill('Looks good')
  await expectNoA11yViolations(page)
  await dialog.getByRole('button', { name: 'Approve' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
  expect(calls.find((call) => call.method === 'POST' && call.path.endsWith('/approve'))?.body).toEqual({ comment: 'Looks good' })

  await page.getByRole('link', { name: 'Back to approvals' }).click()
  await expect(page.getByText('Nothing is waiting for you')).toBeVisible()
  await expectNoA11yViolations(page)
})

test('approval rules can be read and edited accessibly', async ({ page }) => {
  const workflow = {
    code: 'business-case',
    name: 'Business case',
    description: null,
    contextFields: ['tco'],
    fields: [{ path: 'tco', type: 'number', values: null }],
    approversSeeFinancials: true,
  }
  const draft = {
    id: '73000000-0000-4000-8000-000000000001',
    workflowCode: 'business-case',
    ruleVersion: 1,
    status: 'draft',
    definition: {
      rules: [
        {
          key: 'large',
          name: 'Large',
          priority: 10,
          when: { all: [{ field: 'tco', op: 'gte', value: 250000 }] },
          steps: [{ key: 'exco', name: 'EXCO', approvers: [{ kind: 'role', roleCode: 'tech-exco', scope: 'global' }], quorum: 'all', reReview: 'rejecters', slaHours: 24 }],
        },
      ],
    },
    publishedAt: null,
    publishedBy: null,
    version: 1,
    createdAt: '2026-10-20T01:00:00.000Z',
  }
  await mockApi(page, ['approvals:rule-set:read', 'approvals:rule-set:manage'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/approval-workflows': { status: 200, body: { items: [workflow] } },
    'GET /api/v1/approval-rule-sets': { status: 200, body: { items: [draft] } },
    [`GET /api/v1/approval-rule-sets/${draft.id}`]: { status: 200, body: draft },
    'GET /api/v1/approval-rule-options': { status: 200, body: { roles: [{ code: 'tech-exco', name: 'Tech EXCO' }] } },
  })
  await page.goto('/admin/approval-rules')

  await expect(page.getByRole('region', { name: 'Business case', exact: true })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('link', { name: 'Open version 1' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Business case: version 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Add group' }).click()
  await expect(page.getByRole('group', { name: 'Group' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('the audit log and its date filters are accessible', async ({ page }) => {
  await mockApi(page, ['audit:log:read'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/audit-logs/facets': { status: 200, body: { actions: ['user.updated'], resourceTypes: ['user'] } },
    'GET /api/v1/audit-logs': {
      status: 200,
      body: {
        items: [
          {
            id: '80000000-0000-4000-8000-000000000001',
            occurredAt: '2026-10-21T02:00:00.000Z',
            actorUserId: ME.id,
            actor: { ...ME, email: 'ada.admin@aia.com' },
            authMethod: 'session',
            action: 'user.updated',
            resourceType: 'user',
            resourceId: 'u-1',
            httpMethod: null,
            path: null,
            statusCode: null,
            requestId: null,
            ipAddress: null,
            changes: { before: { status: 'active' }, after: { status: 'disabled' } },
            metadata: null,
          },
        ],
        page: 1,
        pageSize: 50,
        total: 1,
      },
    },
  })
  await page.goto('/admin/audit-log')

  await expect(page.getByRole('table', { name: 'Audit entries' })).toContainText('user.updated')
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Choose date' }).first().click()
  await expect(page.getByRole('grid')).toBeVisible()
  await expectNoA11yViolations(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Details of entry at/ }).click()
  await expect(page.getByRole('dialog', { name: 'Audit entry' })).toContainText('disabled')
  await expectNoA11yViolations(page)
})

test('out of office: choose a delegate and dates with the calendar', async ({ page }) => {
  const calls = await mockApi(page, ['approvals:delegation:manage', 'approvals:instance:read', 'people:directory:read'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/me/delegations': { status: 200, body: { items: [] } },
    'GET /api/v1/people': { status: 200, body: { items: [{ id: '72000000-0000-4000-8000-000000000001', name: 'Ali Approver', email: 'ali@aia.com', isExternal: false }] } },
    'POST /api/v1/me/delegations': (call) => ({ status: 201, body: { id: '74000000-0000-4000-8000-000000000001', toUser: { id: '72000000-0000-4000-8000-000000000001', name: 'Ali Approver' }, startsAt: (call.body as { startsAt: string }).startsAt, endsAt: (call.body as { endsAt: string }).endsAt, reason: null, cancelledAt: null } }),
  })
  await page.goto('/approvals/out-of-office')

  await page.getByRole('button', { name: 'Add delegation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add delegation' })
  await dialog.getByRole('combobox', { name: 'Delegate' }).fill('al')
  await page.getByRole('option', { name: /Ali Approver/ }).click()
  await dialog.getByRole('button', { name: 'Choose date' }).nth(1).click()
  const calendar = page.getByRole('grid')
  await expect(calendar).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('grid').getByRole('button').filter({ hasText: /^15$/ }).click()
  await expect(calendar).toBeHidden()
  await dialog.getByRole('button', { name: 'Add delegation' }).click()

  await expect(dialog).toBeHidden()
  const body = calls.find((call) => call.method === 'POST')?.body as { toUserId: string; startsAt: string; endsAt: string }
  expect(body.toUserId).toBe('72000000-0000-4000-8000-000000000001')
  expect(Date.parse(body.endsAt)).toBeGreaterThan(Date.parse(body.startsAt))
})
