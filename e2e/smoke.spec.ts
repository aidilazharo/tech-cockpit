import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('renders React app, serves API, and has no critical/serious accessibility violations', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ATGV React/i })).toBeVisible();
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
});
