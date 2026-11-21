import { expect, test, type Page } from '@playwright/test'
import { signInAtOkta, testUser, type TestUser } from './support/okta'

// Vendors are marked in TechCockpit (Users page → Type = Vendor), not in Okta. Only people
// added on the Users page can sign in, by their Okta username.
const vendor = testUser('VENDOR')
const employee = testUser('ENTERPRISE_ARCHITECT')

const NOT_ADDED = 'Not signed in: add this test user on the Users page first (Okta username = their Okta login).'
const VENDOR_HINT = 'The vendor test user is not marked as a vendor: Users → the vendor → Edit details → Type = Vendor.'

async function signIn(page: Page, user: TestUser) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in with Okta' }).click()
  await signInAtOkta(page, user)
}

/** /api/v1/me with this browser's session cookies (through the Vite proxy, like the app). */
async function me(page: Page) {
  const res = await page.request.get('/api/v1/me')
  expect(res.status(), NOT_ADDED).toBe(200)
  return (await res.json()) as { user: { username: string; isExternal: boolean }; isSystemAdmin: boolean }
}

test('signs in a vendor marked in TechCockpit and keeps them out of staff data', async ({ page }) => {
  test.skip(!vendor, 'Set E2E_VENDOR_EMAIL and E2E_VENDOR_PASSWORD in .env.e2e.local')
  await signIn(page, vendor!)

  const profile = await me(page)
  expect(profile.user.username).toBe(vendor!.email.toLowerCase())
  expect(profile.user.isExternal, VENDOR_HINT).toBe(true)
  expect(profile.isSystemAdmin).toBe(false)

  // Staff data is refused to the seeded Vendor role: the directory and the user list need permissions it lacks.
  // (A search needs at least 2 characters; a shorter one is refused as bad input before this check.)
  expect((await page.request.get('/api/v1/people?q=ab')).status()).toBe(403)
  expect((await page.request.get('/api/v1/users')).status()).toBe(403)
})

test('does not mark an employee as a vendor', async ({ page }) => {
  test.skip(!employee, 'Set E2E_ENTERPRISE_ARCHITECT_EMAIL and E2E_ENTERPRISE_ARCHITECT_PASSWORD in .env.e2e.local')
  await signIn(page, employee!)

  const profile = await me(page)
  expect(profile.user.username).toBe(employee!.email.toLowerCase())
  expect(profile.user.isExternal, 'The employee test user is marked as a vendor: Users → the person → Edit details → Type = Employee').toBe(false)

  await page.getByRole('button', { name: /account menu for / }).click()
  await expect(page.getByRole('menu')).toContainText(employee!.email)
  await expect(page.getByRole('menu').getByText('Vendor', { exact: true })).toHaveCount(0)
})
