import { expect, test, type Page, type Route } from '@playwright/test'
import { expectNoA11yViolations } from './support/a11y'

// The API is mocked in the browser: these tests cover the screens, not Okta.
// e2e-okta/ signs in through the real Okta dev tenant.

const problem = (status: number, title: string) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({ type: 'about:blank', title, status }),
})

const me = (overrides: { isExternal?: boolean; roles?: string[] } = {}) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    user: { id: 'u1', username: 'test.admin', email: 'test.admin@aia.com', firstName: 'Test', lastName: 'Admin', isExternal: overrides.isExternal ?? false },
    roles: overrides.roles ?? ['pmo'],
    permissions: [],
    isSystemAdmin: false,
    authMethod: 'session',
    session: { accessExpiresAt: new Date(Date.now() + 900_000).toISOString(), expiresAt: new Date(Date.now() + 14_400_000).toISOString() },
  }),
})

// Anything a test does not answer gets 404, so a local backend on :3000 (behind the dev
// server's /api proxy) never changes the result. Routes added later in a test take precedence.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', (route) => route.fulfill(problem(404, 'Not Found')))
})

async function signedOut(page: Page) {
  await page.route('**/api/v1/me', (route) => route.fulfill(problem(401, 'Unauthorized')))
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill(problem(401, 'Unauthorized')))
}

async function signedIn(page: Page, overrides?: Parameters<typeof me>[0]) {
  await page.route('**/api/v1/me', (route) => route.fulfill(me(overrides)))
}

test('sends a visitor without a session to the sign-in page', async ({ page }) => {
  await signedOut(page)
  await page.goto('/')

  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with Okta' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('sends the user to Okta sign-in and remembers where they were', async ({ page }) => {
  await signedOut(page)
  let requested = ''
  await page.route('**/api/v1/auth/saml/login**', (route: Route) => {
    requested = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Okta</title><h1>Okta sign-in</h1>' })
  })
  await page.goto('/approvals?tab=mine')

  await expect(page).toHaveURL(/\/signin\?returnTo=%2Fapprovals%3Ftab%3Dmine$/)
  await page.getByRole('button', { name: 'Sign in with Okta' }).click()

  await expect(page.getByRole('heading', { name: 'Okta sign-in' })).toBeVisible()
  expect(new URL(requested).searchParams.get('returnTo')).toBe('/approvals?tab=mine')
})

test('explains why sign-in failed, accessibly', async ({ page }) => {
  await signedOut(page)
  await page.goto('/signin?error=account_disabled')

  await expect(page.getByRole('alert', { name: 'Your account is disabled' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('shows the signed-in user in the account menu and signs out', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204 }))
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Test' })).toBeVisible()
  await expectNoA11yViolations(page)

  await page.getByRole('button', { name: 'TA account menu for Test Admin' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toContainText('test.admin@aia.com')
  await expectNoA11yViolations(page)
  await menu.getByRole('menuitem', { name: 'Sign out' }).click()

  await expect(page.getByRole('status', { name: 'You have signed out' })).toBeVisible()
  await expect(page).toHaveURL(/\/signin$/)
})

test('changes the theme from the account menu with the keyboard', async ({ page }) => {
  await signedIn(page)
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'TA account menu for Test Admin' })

  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expectNoA11yViolations(page)
})

test('shows a full "no access" page to someone without a role in force', async ({ page }) => {
  await signedIn(page, { roles: [] })
  await page.goto('/trm/applications')

  await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to TechCockpit' })).toBeVisible()
  await expect(page.getByText('Signed in as test.admin.')).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('tells someone nobody has added which Okta username they used', async ({ page }) => {
  await signedOut(page)
  await page.route('**/api/v1/auth/refused-username', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'new.person' }) }))
  await page.goto('/signin?error=not_registered')

  await expect(page.getByRole('alert', { name: 'You have not been added to TechCockpit' })).toContainText('Your Okta username: new.person')
  await expectNoA11yViolations(page)
})

test('marks vendors in the account menu', async ({ page }) => {
  await signedIn(page, { roles: ['vendor'], isExternal: true })
  await page.goto('/')

  await page.getByRole('button', { name: 'TA account menu for Test Admin' }).click()
  await expect(page.getByRole('menu').getByText('Vendor', { exact: true })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('shows "page not found" for an unknown address and links home', async ({ page }) => {
  await signedIn(page)
  await page.goto('/no-such-page')

  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('link', { name: 'Go to the home page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Test' })).toBeVisible()
})

test('offers a retry when the API cannot be reached', async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.fulfill(problem(503, 'Service Unavailable')))
  await page.goto('/')

  await expect(page.getByRole('alert', { name: 'TechCockpit is unavailable' })).toBeVisible()
  await expectNoA11yViolations(page)
})
