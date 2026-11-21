import { expect, test } from '@playwright/test'
import { calls } from '../src/features/sad/calls/fixtures'
import { APP_CRM, applicationSummary, capabilities, domains, INITIATIVE_ID, initiative, landscapeApp, page as listPage, portfolios, STD_PG, technology } from '../src/features/trm/fixtures'
import { expectNoA11yViolations } from './support/a11y'
import { mockApi } from './support/mock-api'

test('an architect reads the landscape by capability, lifecycle and technology', async ({ page }) => {
  await mockApi(page, ['trm:application:read'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/trm/landscape': { status: 200, body: { applications: [landscapeApp(), landscapeApp({ id: '80000000-0000-4000-8000-000000000002', name: 'Billing', capabilityId: null, timeRating: null })] } },
    'GET /api/v1/trm/capabilities': { status: 200, body: { items: capabilities } },
    'GET /api/v1/trm/domains': { status: 200, body: { items: domains } },
    'GET /api/v1/portfolios': { status: 200, body: { items: portfolios } },
    'GET /api/v1/trm/technology': { status: 200, body: technology },
    [`GET /api/v1/trm/technology/standards/${STD_PG}`]: { status: 200, body: { models: [{ id: '83000000-0000-4000-8000-000000000001', name: 'PostgreSQL 15', productVersion: '15', applications: [{ id: APP_CRM, name: 'CRM' }] }] } },
  })
  await page.goto('/trm/landscape')
  await expect(page.getByRole('region', { name: 'Identity check' }).getByRole('link', { name: /^CRM/ })).toContainText('In Production')
  await expectNoA11yViolations(page)

  await page.getByRole('combobox', { name: 'Colour by' }).click()
  await page.getByRole('option', { name: 'TIME rating' }).click()
  await expect(page.getByRole('region', { name: 'Identity check' }).getByRole('link', { name: /^CRM/ })).toContainText('Invest')

  await page.getByRole('tab', { name: 'Lifecycle' }).click()
  await expect(page.getByRole('list', { name: 'Lifecycle timeline' })).toContainText('Go-live 01/01/2027')
  // 2027 to 2030 is longer than two years: it starts on quarters; months scroll sideways.
  await expect(page.getByRole('combobox', { name: 'Timeline scale' })).toContainText('Quarters')
  await page.getByRole('combobox', { name: 'Timeline scale' }).click()
  await page.getByRole('option', { name: 'Months' }).click()
  const chart = page.getByRole('region', { name: 'Lifecycle timeline chart' })
  await expect(chart).toContainText('Jan')
  expect(await chart.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  await expectNoA11yViolations(page)

  await page.getByRole('tab', { name: 'Technology' }).click()
  await page.getByRole('button', { name: /PostgreSQL 15/ }).click()
  await expect(page.getByRole('region', { name: 'Data & Analytics' }).getByRole('link', { name: 'CRM' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test("an architect sees an application's dependencies from the approved SADs, with what it calls only where they read section 2", async ({ page }) => {
  await mockApi(page, ['trm:application:read'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/trm/landscape': { status: 200, body: { applications: [landscapeApp()] } },
    'GET /api/v1/trm/domains': { status: 200, body: { items: domains } },
    'GET /api/v1/portfolios': { status: 200, body: { items: portfolios } },
    'GET /api/v1/trm/applications': { status: 200, body: listPage([applicationSummary()]) },
    [`GET /api/v1/sad/applications/${APP_CRM}/calls`]: { status: 200, body: { items: calls } },
  })
  await page.goto('/trm/landscape')
  await page.getByRole('tab', { name: 'Dependencies' }).click()
  await expect(page.getByText('Pick an application to see the applications calling it and those it calls.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Application' }).fill('CR')
  await page.getByRole('option', { name: /^CRM/ }).click()

  const canvas = page.getByRole('application', { name: 'CRM: diagram canvas' })
  await expect(canvas.getByText('Customer Portal')).toBeVisible()
  // CRM's two connections to Billing are two lines, spread apart.
  await expect(canvas.getByRole('button', { name: 'Billing API: create invoice' })).toBeVisible()
  await expect(canvas.getByRole('button', { name: 'Invoice file' })).toBeVisible()
  const calling = page.getByRole('table', { name: 'Applications calling CRM (2)' })
  await expect(calling.getByRole('row', { name: /Customer Portal/ })).toContainText('RestrictedRestrictedOne-wayCustomer Portal\'s SAD v4, approved 2 Jun 2026')
  await expect(page.getByRole('table', { name: 'Applications CRM calls (2)' }).getByRole('row', { name: /Bills premiums/ })).toContainText('Two-way')
  // Centred, so the sticky header does not cover the canvas's zoom buttons while the page is checked.
  await canvas.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expectNoA11yViolations(page)
})

test('an enterprise architect adds a roadmap initiative', async ({ page }) => {
  let created = false
  const calls = await mockApi(page, ['trm:application:read', 'trm:roadmap:read', 'trm:roadmap:manage'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
    'GET /api/v1/trm/initiatives': () => ({ status: 200, body: listPage(created ? [{ id: INITIATIVE_ID, name: 'Modernise CRM', status: 'proposed', startDate: '2027-01-01', endDate: '2028-06-30', owner: null, actionCounts: { introduce: 1, enhance: 0, replace: 0, retire: 0 } }] : []) }),
    'GET /api/v1/trm/planned-applications': { status: 200, body: { items: [] } },
    'GET /api/v1/trm/capabilities': { status: 200, body: { items: capabilities } },
    'POST /api/v1/trm/initiatives': () => {
      created = true
      return { status: 201, body: initiative({ status: 'proposed', actions: [initiative().actions[0]] }) }
    },
    [`GET /api/v1/trm/initiatives/${INITIATIVE_ID}`]: { status: 200, body: initiative({ status: 'proposed', actions: [initiative().actions[0]] }) },
  })
  await page.goto('/trm/roadmap')
  await expect(page.getByText('No initiatives match')).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('link', { name: 'New initiative' }).click()

  await page.getByRole('textbox', { name: 'Name' }).fill('Modernise CRM')
  await page.getByRole('textbox', { name: 'Start date' }).fill('01012027')
  await page.getByRole('textbox', { name: 'End date' }).fill('30062028')
  await page.getByRole('button', { name: 'Add an application' }).click()
  await page.getByRole('group', { name: 'Application 1' }).getByRole('textbox', { name: 'Planned application name' }).fill('New CRM')
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Modernise CRM' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Introduce' })).toContainText('New CRM')
  const post = calls.find((call) => call.method === 'POST' && call.path === '/api/v1/trm/initiatives')
  expect(post?.body).toMatchObject({ name: 'Modernise CRM', startDate: '2027-01-01', endDate: '2028-06-30', actions: [{ action: 'introduce', plannedApplicationName: 'New CRM' }] })
  await expectNoA11yViolations(page)
})
