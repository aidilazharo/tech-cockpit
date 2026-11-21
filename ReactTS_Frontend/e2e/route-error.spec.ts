import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from './support/a11y'
import { mockApi } from './support/mock-api'

test('explains a page whose code cannot be downloaded, reloading only once', async ({ page }) => {
  await mockApi(page, ['apikey:own:manage'], {
    'GET /api/v1/me/notifications/unread-count': { status: 200, body: { unread: 0 } },
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /^Welcome, / })).toBeVisible()

  // As when the dev server has stopped, or a new release replaced the files.
  await page.route('**/src/features/me/ApiKeysPage.tsx*', (route) => route.abort())
  let loads = 0
  page.on('load', () => (loads += 1))
  await page.goto('/me/api-keys')

  await expect(page.getByRole('heading', { level: 1, name: 'This page could not be loaded' })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible() // the app shell stays (navigation is a drawer on phones)
  await expect.poll(() => loads).toBe(2) // the visit plus one automatic reload, then it stops
  await page.waitForTimeout(500)
  expect(loads).toBe(2)
  await expectNoA11yViolations(page)
})
