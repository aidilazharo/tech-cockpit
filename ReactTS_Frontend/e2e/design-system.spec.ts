import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from './support/a11y'

test.beforeEach(async ({ page }) => {
  await page.goto('/design-system')
  // The gallery route is loaded on demand; wait until it has rendered.
  await expect(page.getByRole('heading', { level: 1, name: 'Qi design system' })).toBeVisible()
})

test('shows the Qi design system with one h1 and landmarks', async ({ page }) => {
  await expect(page).toHaveTitle('AIA TechCockpit')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: 'Qi design system' })).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
})

test('every button has an accessible name', async ({ page }) => {
  const buttons = page.getByRole('button')
  const count = await buttons.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const name = (await buttons.nth(i).getAttribute('aria-label')) ?? (await buttons.nth(i).innerText())
    expect(name.trim()).not.toBe('')
  }
})

test('opens the approval dialog with the keyboard, traps focus, and Escape returns focus', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Submit for approval' })
  await trigger.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: 'Submit business case for approval?' })
  await expect(dialog).toBeVisible()
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab')
    await expect(dialog.locator(':focus')).toHaveCount(1)
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('switches to dark theme and back', async ({ page }) => {
  const html = page.locator('html')
  const lightBackground = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)

  await page.getByRole('combobox', { name: 'Theme' }).click()
  await page.getByRole('option', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  const darkBackground = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
  expect(darkBackground).not.toBe(lightBackground)

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('combobox', { name: 'Theme' }).click()
  await page.getByRole('option', { name: 'Light' }).click()
  await expect(html).toHaveAttribute('data-theme', 'light')
})

test('rejects an invalid TCO amount and accepts a valid one', async ({ page }) => {
  const tco = page.getByRole('textbox', { name: 'Total cost of ownership (RM)' })

  await tco.fill('two hundred')
  await tco.blur()
  await expect(tco).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Enter an amount in RM')).toBeVisible()

  await tco.fill('250000.00')
  await tco.blur()
  await expect(page.getByText('Enter an amount in RM')).toBeHidden()
})

test('disabled and loading buttons cannot be activated', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Disabled' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Submitting' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Submitting' })).toHaveAttribute('aria-busy', 'true')
})

test('sorts the applications table and marks the sorted column', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Business applications' })
  const header = table.getByRole('columnheader', { name: /Application/ })

  await header.getByRole('button').click()
  await expect(header).toHaveAttribute('aria-sort', 'ascending')
  await expect(table.getByRole('row').nth(1)).toContainText('Agent Portal')

  await header.getByRole('button').click()
  await expect(header).toHaveAttribute('aria-sort', 'descending')
  await expect(table.getByRole('row').nth(1)).toContainText('Policy Administration')
})

test('shows "Restricted" instead of a financial value the user may not see', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Business applications' })
  await expect(table.getByText('Restricted')).toBeVisible()
  await expect(table.getByText(/RM\s1,250,000\.00/)).toBeVisible()
})

test('meets WCAG 2.2 AA in the light theme', async ({ page }) => {
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await expectNoA11yViolations(page)
})

test('meets WCAG 2.2 AA in the dark theme', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Theme' }).click()
  await page.getByRole('option', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectNoA11yViolations(page)
})

test('meets WCAG 2.2 AA with the dialog open', async ({ page }) => {
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoA11yViolations(page, '[role="dialog"]')
})

test('shows field errors accessibly (WCAG 2.2 AA) after invalid input', async ({ page }) => {
  const tco = page.getByRole('textbox', { name: 'Total cost of ownership (RM)' })
  await tco.fill('abc')
  await tco.blur()
  await expect(page.getByText('Enter an amount in RM')).toBeVisible()
  await expectNoA11yViolations(page)
})

test('has no horizontal page scroll at this viewport width', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
