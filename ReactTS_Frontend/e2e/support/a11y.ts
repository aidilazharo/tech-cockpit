import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import type { Result } from 'axe-core'

/** WCAG 2.2 level A and AA rules (includes 2.0 and 2.1). */
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** The element, plus the measured colours for contrast failures (e.g. "#e00842 on #ffedf1 = 4.35"). */
function describe(node: Result['nodes'][number]): string {
  const target = node.target.join(' ')
  const data = node.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined
  return data?.contrastRatio ? `${target} (${data.fgColor} on ${data.bgColor} = ${data.contrastRatio})` : target
}

/** Fails the test with a readable list when axe finds WCAG 2.2 AA violations. */
export async function expectNoA11yViolations(page: Page, include?: string): Promise<void> {
  // Scan the resting state: the last click leaves the pointer over a control, and its hover colours
  // (mid-transition) would be measured instead. Park the pointer and let colour transitions finish.
  await page.mouse.move(0, 0)
  await page.waitForFunction(() => document.getAnimations().every((animation) => !('transitionProperty' in animation)))
  // Sticky bars (the page header, the Save bar) lie over whatever is scrolled under them, and axe measures a control
  // they half cover as too small; a person scrolls it clear. The scan sees them in the page flow instead.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      if (getComputedStyle(element).position !== 'sticky') continue
      element.dataset.a11yPosition = element.style.position
      element.style.position = 'static'
    }
  })
  const builder = new AxeBuilder({ page }).withTags(WCAG_22_AA)
  const results = await (include ? builder.include(include) : builder).analyze()
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>('[data-a11y-position]')) {
      element.style.position = element.dataset.a11yPosition!
      delete element.dataset.a11yPosition
    }
  })
  const summary = results.violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.map(describe).join(', ')}`,
  )
  expect(summary, 'WCAG 2.2 AA violations').toEqual([])
}
