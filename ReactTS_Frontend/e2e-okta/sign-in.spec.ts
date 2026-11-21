import { expect, test } from '@playwright/test'
import { signInAtOkta, testUser } from './support/okta'

const admin = testUser('SYSTEM_ADMIN')

test.skip(!admin, 'Set E2E_SYSTEM_ADMIN_EMAIL and E2E_SYSTEM_ADMIN_PASSWORD in .env.e2e.local')

test('signs in through Okta, returns to the page and signs out of TechCockpit only', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in with Okta' }).click()

  await signInAtOkta(page, admin!)

  await expect(page.getByRole('heading', { level: 1, name: /^Welcome, / })).toBeVisible()
  await expect(page).toHaveURL('http://localhost:5173/')

  // The session survives a reload (cookies), then sign-out ends it.
  await page.reload()
  await page.getByRole('button', { name: /account menu for / }).click()
  await expect(page.getByRole('menu')).toContainText(admin!.email)
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('status', { name: 'You have signed out' })).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
})

test('returns a deep link after sign-in', async ({ page }) => {
  await page.goto('/approvals?tab=mine')
  await expect(page).toHaveURL(/\/signin\?returnTo=/)
  await page.getByRole('button', { name: 'Sign in with Okta' }).click()

  // Each test gets a fresh browser context, so Okta asks for the password again.
  await signInAtOkta(page, admin!)

  await expect(page).toHaveURL('http://localhost:5173/approvals?tab=mine')
})
