import { expect, test } from '@playwright/test'
import {
  APP_CRM,
  application,
  applicationSummary,
  capabilities,
  facets,
  MISSING_BILLING,
  missingRecord,
  missingSummary,
  page as listPage,
  portfolios,
  RUN_ID,
  syncRun,
} from '../src/features/trm/fixtures'
import { expectNoA11yViolations } from './support/a11y'
import { mockApi } from './support/mock-api'

test('an architect finds an application, reads it and updates its TRM assessment', async ({ page }) => {
  let current = application()
  const calls = await mockApi(page, ['trm:application:read', 'trm:application:update'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/trm/facets': { status: 200, body: facets },
    'GET /api/v1/trm/capabilities': { status: 200, body: { items: capabilities } },
    'GET /api/v1/portfolios': { status: 200, body: { items: portfolios } },
    'GET /api/v1/trm/applications': { status: 200, body: listPage([applicationSummary()]) },
    [`GET /api/v1/trm/applications/${APP_CRM}`]: () => ({ status: 200, body: current }),
    [`PATCH /api/v1/trm/applications/${APP_CRM}`]: (call) => {
      const trm = { ...(call.body as Record<string, unknown>) }
      delete trm.version
      current = { ...current, version: current.version + 1, trm: { ...current.trm, ...trm } }
      return { status: 200, body: current }
    },
  })

  await page.goto('/trm/applications')
  await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('searchbox', { name: 'Search by name or number' }).fill('crm')
  await expect.poll(() => calls.some((call) => call.path.includes('q=crm'))).toBe(true)
  await page.getByRole('link', { name: 'CRM', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'CRM' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'TRM assessment' })).toContainText('Invest')
  await expect(page.getByRole('region', { name: 'Annual costs (thousands of USD)' })).toContainText('136.22')
  await expectNoA11yViolations(page)

  await page.getByRole('button', { name: 'Edit TRM assessment' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit TRM assessment' })
  await dialog.getByRole('combobox', { name: 'TIME rating' }).click()
  await page.getByRole('option', { name: 'Migrate' }).click()
  await dialog.getByRole('textbox', { name: 'Planned phase-out' }).fill('01062028')
  await expectNoA11yViolations(page)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('region', { name: 'TRM assessment' })).toContainText('Migrate')
  await expect(page.getByRole('region', { name: 'TRM assessment' })).toContainText('01/06/2028')
})

test('a system admin reads a sync run report', async ({ page }) => {
  const summary = Object.fromEntries(Object.entries(syncRun()).filter(([key]) => key !== 'report'))
  await mockApi(page, ['trm:sync:run'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/trm/sync-runs': { status: 200, body: listPage([summary]) },
    [`GET /api/v1/trm/sync-runs/${RUN_ID}`]: { status: 200, body: syncRun() },
  })
  await page.goto('/admin/trm-sync')
  await expect(page.getByRole('heading', { level: 1, name: 'TRM sync runs' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('table', { name: 'Sync runs' }).getByRole('link').click()
  await expect(page.getByRole('heading', { level: 1, name: /Sync run of/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Not matched' })).toContainText('Unknown service')
  await expectNoA11yViolations(page)
})

test('a system admin removes records ServiceNow no longer exports, but not the ones still in use', async ({ page }) => {
  let remaining = [missingRecord(), missingRecord({ id: MISSING_BILLING, number: 'APM-11', name: 'Billing', snSysId: 'sys-billing', blockers: ['has-sad-history'] })]
  const calls = await mockApi(page, ['trm:synced-record:delete'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/trm/missing-records/summary': () => ({ status: 200, body: missingSummary({ applications: remaining.length }) }),
    'GET /api/v1/trm/missing-records': () => ({ status: 200, body: listPage(remaining) }),
    'POST /api/v1/trm/missing-records/delete': (call) => {
      const { ids } = call.body as { ids: string[] }
      remaining = remaining.filter((row) => !ids.includes(row.id))
      return { status: 200, body: { deleted: ids, refused: [] } }
    },
  })

  await page.goto('/admin/trm-missing')
  await expect(page.getByRole('heading', { level: 1, name: 'Records missing from ServiceNow' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Billing' })).toHaveAttribute('aria-disabled', 'true')
  await expectNoA11yViolations(page)

  await page.getByRole('checkbox', { name: 'Select all removable records on this page' }).click()
  await expect(page.getByRole('checkbox', { name: 'Legacy CRM' })).toBeChecked()
  await page.getByRole('button', { name: 'Remove selected (1)' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Remove 1 record?' })
  await expect(dialog).toBeVisible()
  await expectNoA11yViolations(page)
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Remove' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByText('1 record removed')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Legacy CRM' })).toBeHidden()
  await expect(page.getByRole('checkbox', { name: 'Billing' })).toBeVisible()
  await expectNoA11yViolations(page)
})
