import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from './support/a11y'
import { mockApi } from './support/mock-api'

const ADMIN = [
  'access:user:read',
  'access:user:manage',
  'access:assignment:read',
  'access:assignment:manage',
  'access:role:read',
  'access:role:manage',
  'access:department:manage',
  'apikey:own:manage',
]
const IT = '10000000-0000-4000-8000-000000000001'
const ana = {
  id: '20000000-0000-4000-8000-000000000001',
  username: 'ana.lim',
  email: 'ana.lim@aia.com',
  emailFromOkta: true,
  firstName: 'Ana',
  lastName: 'Lim',
  status: 'active',
  isExternal: false,
  departmentId: IT,
  lastLoginAt: '2026-10-20T02:00:00.000Z',
  version: 1,
}
const pmo = {
  id: '30000000-0000-4000-8000-000000000001',
  code: 'pmo',
  name: 'PMO',
  description: null,
  isSystem: true,
  isSystemAdmin: false,
  permissions: ['approvals:instance:read'],
  dataAccess: { financial: 'all', contract: 'none', personal: 'none' },
  canActForStaff: true,
  version: 1,
}
const departments = { status: 200, body: { items: [{ id: IT, code: 'IT', name: 'Information Technology', active: true, version: 1 }] } }
const noRefusals = { status: 200, body: { items: [], page: 1, pageSize: 100, total: 0 } }

test('an administrator finds a user and gives them a role', async ({ page }) => {
  let assignments: unknown[] = []
  const calls = await mockApi(page, ADMIN, {
    'GET /api/v1/departments': departments,
    'GET /api/v1/refused-sign-ins': noRefusals,
    'GET /api/v1/users': { status: 200, body: { items: [ana], page: 1, pageSize: 25, total: 1 } },
    [`GET /api/v1/users/${ana.id}`]: { status: 200, body: ana },
    [`GET /api/v1/users/${ana.id}/role-assignments`]: () => ({ status: 200, body: { items: assignments } }),
    'GET /api/v1/roles': { status: 200, body: { items: [pmo] } },
    'POST /api/v1/role-assignments': () => {
      assignments = [
        { id: '40000000-0000-4000-8000-000000000001', userId: ana.id, roleCode: 'pmo', roleName: 'PMO', scopeType: 'global', scopeId: null, validFrom: new Date().toISOString(), validTo: null, active: true },
      ]
      return { status: 201, body: assignments[0] }
    },
  })
  await page.goto('/admin/users')

  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('searchbox', { name: 'Search by name, Okta username or email' }).fill('ana')
  await expect(page).toHaveURL(/\/admin\/users\?q=ana$/)
  await page.getByRole('link', { name: 'Ana Lim' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Ana Lim' })).toBeVisible()
  await expect(page.getByText('No roles assigned yet')).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Assign role' }).click()
  const dialog = page.getByRole('dialog', { name: 'Assign role to Ana Lim' })
  await dialog.getByRole('combobox', { name: 'Role' }).click()
  await page.getByRole('option', { name: 'PMO' }).click()
  await expectNoA11yViolations(page)
  await dialog.getByRole('button', { name: 'Assign role' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('table', { name: 'Role assignments' })).toContainText('PMO')
  expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ userId: ana.id, roleCode: 'pmo', scopeType: 'global' })
})

test('an administrator adds someone Okta refused, as a vendor, and can edit their details', async ({ page }) => {
  const added = { ...ana, id: '20000000-0000-4000-8000-000000000005', username: 'new.person', email: 'new.person@vendor.com', emailFromOkta: false, firstName: 'New', lastName: 'Person', isExternal: true, departmentId: null, lastLoginAt: null }
  let refusals = [{ id: '25000000-0000-4000-8000-000000000001', username: 'new.person', email: 'new.person@vendor.com', firstName: 'New', lastName: 'Person', attempts: 3, firstAttemptAt: '2026-10-22T01:00:00.000Z', lastAttemptAt: '2026-10-23T01:00:00.000Z' }]
  const calls = await mockApi(page, ADMIN, {
    'GET /api/v1/departments': departments,
    'GET /api/v1/users': { status: 200, body: { items: [ana], page: 1, pageSize: 25, total: 1 } },
    'GET /api/v1/refused-sign-ins': () => ({ status: 200, body: { items: refusals, page: 1, pageSize: 100, total: refusals.length } }),
    'POST /api/v1/users': () => {
      refusals = []
      return { status: 201, body: added }
    },
    [`GET /api/v1/users/${added.id}`]: { status: 200, body: added },
    [`GET /api/v1/users/${added.id}/role-assignments`]: { status: 200, body: { items: [] } },
    'GET /api/v1/roles': { status: 200, body: { items: [pmo] } },
  })
  await page.goto('/admin/users')

  await expect(page.getByRole('table', { name: 'Refused sign-ins' })).toContainText('new.person')
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Add user new.person' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add user' })
  await expect(dialog.getByRole('textbox', { name: 'Okta username' })).toHaveValue('new.person')
  await dialog.getByRole('combobox', { name: 'Type' }).click()
  await page.getByRole('option', { name: 'Vendor' }).click()
  await expectNoA11yViolations(page)
  await dialog.getByRole('button', { name: 'Add user' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'New Person' })).toBeVisible()
  expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ username: 'new.person', email: 'new.person@vendor.com', firstName: 'New', lastName: 'Person', isExternal: true })
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit details of New Person' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('the role editor shows permissions and data access, accessibly', async ({ page }) => {
  await mockApi(page, ADMIN, {
    'GET /api/v1/roles': { status: 200, body: { items: [pmo] } },
    [`GET /api/v1/roles/${pmo.id}`]: { status: 200, body: pmo },
    'GET /api/v1/permissions': {
      status: 200,
      body: { items: [{ code: 'approvals:instance:read', description: 'See approval progress and where it is waiting' }, { code: 'audit:log:read', description: 'Read the audit log' }] },
    },
  })
  await page.goto('/admin/roles')

  await page.getByRole('link', { name: 'PMO' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'PMO' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'See approval progress and where it is waiting' })).toBeChecked()
  await expect(page.getByRole('combobox', { name: 'Financial data' })).toContainText('All')
  await expectNoA11yViolations(page)
})

test('a user creates an API key and sees it only once', async ({ page }) => {
  const token = 'tck_AbC123def456ghi7_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG'
  await mockApi(page, ['apikey:own:manage'], {
    'GET /api/v1/me/api-keys': { status: 200, body: { items: [] } },
    'POST /api/v1/me/api-keys': {
      status: 201,
      body: { id: '50000000-0000-4000-8000-000000000001', name: 'CLI', keyPrefix: 'tck_AbC123', expiresAt: '2099-01-01T00:00:00.000Z', lastUsedAt: null, revokedAt: null, createdAt: '2026-10-21T00:00:00.000Z', token },
    },
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'AA account menu for Ada Admin' }).click()
  await page.getByRole('menuitem', { name: 'API keys' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'API keys' })).toBeVisible()
  await page.getByRole('button', { name: 'Create API key' }).click()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Name' }).fill('CLI')
  await page.getByRole('dialog').getByRole('button', { name: 'Create API key' }).click()

  const shown = page.getByRole('alertdialog', { name: 'Copy your API key now' })
  await expect(shown.getByRole('textbox', { name: 'API key' })).toHaveValue(token)
  await expectNoA11yViolations(page)
  await shown.getByRole('button', { name: 'I have stored it' }).click()
  await expect(shown).toBeHidden()
  await expect(page.getByText(token)).toHaveCount(0)
})

test('an administrator reclassifies a field, which applies at once', async ({ page }) => {
  const field = (key: string, label: string, dataClass: string, defaultClass = dataClass) => ({ key, module: key.split('.')[0], label, dataClass, defaultClass })
  let licence = field('trm.application.licenceCost', 'Application: licence cost', 'financial')
  const calls = await mockApi(page, ['access:field-class:manage'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/field-classes': () => ({
      status: 200,
      body: { items: [licence, field('trm.application.itApplicationOwner', 'Application: IT application owner', 'personal'), field('sad.api-people', 'API owners and business owners (API inventory)', 'personal')] },
    }),
    'PUT /api/v1/field-classes/trm.application.licenceCost': (call) => {
      licence = { ...licence, dataClass: (call.body as { dataClass: string }).dataClass }
      return { status: 200, body: licence }
    },
  })
  await page.goto('/admin/field-classes')
  await expect(page.getByRole('region', { name: 'Technology Reference Model (TRM)' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('combobox', { name: 'Application: licence cost' }).click()
  await page.getByRole('option', { name: 'Internal' }).click()
  await expect(page.getByText('Application: licence cost is now Internal.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to the default for Application: licence cost' })).toBeVisible()
  await expectNoA11yViolations(page)
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ dataClass: 'internal' })
})

test("an administrator sets up an absent colleague's out of office", async ({ page }) => {
  const SAM = { id: '72000000-0000-4000-8000-000000000002', name: 'Sam Submitter', email: 'sam@aia.com', isExternal: false }
  const ALI = { id: '72000000-0000-4000-8000-000000000001', name: 'Ali Approver', email: 'ali@aia.com', isExternal: false }
  const delegations: unknown[] = []
  const calls = await mockApi(page, ['approvals:any-delegation:manage', 'people:directory:read'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/people': (call) => ({ status: 200, body: { items: call.path.includes('actsForStaff=true') ? [ALI] : [SAM] } }),
    'GET /api/v1/approval-delegations': () => ({ status: 200, body: { items: delegations } }),
    'POST /api/v1/approval-delegations': (call) => {
      const body = call.body as { startsAt: string; endsAt: string }
      const created = { id: '74000000-0000-4000-8000-000000000001', toUser: { id: ALI.id, name: ALI.name }, startsAt: body.startsAt, endsAt: body.endsAt, reason: null, cancelledAt: null }
      delegations.push(created)
      return { status: 201, body: created }
    },
  })
  await page.goto('/admin/out-of-office')
  await expect(page.getByRole('heading', { level: 1, name: 'Out of office for others' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Whose approvals' }).fill('sam')
  await page.getByRole('option', { name: /Sam Submitter/ }).click()
  await expect(page.getByText('Sam Submitter has no current or upcoming delegations')).toBeVisible()
  await expectNoA11yViolations(page)

  await page.getByRole('button', { name: 'Add delegation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add delegation for Sam Submitter' })
  await dialog.getByRole('combobox', { name: 'Delegate' }).fill('al')
  await page.getByRole('option', { name: /Ali Approver/ }).click()
  await dialog.getByRole('button', { name: 'Choose date' }).nth(1).click()
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('grid').getByRole('button').filter({ hasText: /^15$/ }).click()
  await expectNoA11yViolations(page)
  await dialog.getByRole('button', { name: 'Add delegation' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('table', { name: "Sam Submitter's delegations" })).toContainText('Ali Approver')
  expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({ fromUserId: SAM.id, toUserId: ALI.id })
})

test('someone without admin permissions sees no admin pages and is refused at the address', async ({ page }) => {
  await mockApi(page, [], {})
  await page.goto('/admin/users')

  await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('navigation adapts: full on desktop, icons on tablet, a drawer on phone', async ({ page }, testInfo) => {
  await mockApi(page, ADMIN, {
    'GET /api/v1/departments': departments,
    'GET /api/v1/users': { status: 200, body: { items: [ana], page: 1, pageSize: 25, total: 1 } },
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Ada' })).toBeVisible()

  if (testInfo.project.name === 'phone') {
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
    await page.getByRole('button', { name: 'Open navigation' }).click()
    const drawer = page.getByRole('dialog', { name: 'Navigation' })
    await expectNoA11yViolations(page)
    await drawer.getByRole('link', { name: 'Users' }).click()
    await expect(drawer).toBeHidden()
  } else {
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden()
    const label = nav.getByText('Users', { exact: true })
    if (testInfo.project.name === 'tablet') {
      // Icons only: the label stays available to assistive technology.
      await expect(label).toHaveClass(/sr-only/)
    } else {
      await expect(label).toBeVisible()
    }
    await nav.getByRole('link', { name: 'Users' }).click()
  }

  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/users$/)
})
