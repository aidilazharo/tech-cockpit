import { expect, type Page } from '@playwright/test'

export interface TestUser {
  email: string
  password: string
}

/** Credentials of a test user from .env.e2e.local, e.g. role "SYSTEM_ADMIN". */
export function testUser(role: string): TestUser | null {
  const email = process.env[`E2E_${role}_EMAIL`]
  const password = process.env[`E2E_${role}_PASSWORD`]
  return email && password ? { email, password } : null
}

/**
 * Completes the Okta-hosted sign-in (Identity Engine). Works whether Okta asks for the
 * username and password on one page or two. The test users' policy is password only.
 */
export async function signInAtOkta(page: Page, user: TestUser): Promise<void> {
  await page.waitForURL(/\.okta\.com\//)
  const submit = page.locator('[data-type="save"]')
  const username = page.locator('input[name="identifier"]')
  const password = page.locator('input[name="credentials.passcode"]')

  await username.fill(user.email)
  if (!(await password.isVisible())) {
    await submit.click()
  }
  await password.fill(user.password)
  await submit.click()
  await expect(page).toHaveURL(/^http:\/\/localhost:5173\//, { timeout: 30_000 })
}
