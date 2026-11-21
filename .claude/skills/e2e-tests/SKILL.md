---
name: e2e-tests
description: Writes TechCockpit end-to-end tests — Playwright UI journeys in ReactTS_Frontend (installed Edge, one Okta login per role) and supertest API tests in NestJS_Backend — with mandatory negative RBAC cases. Use when adding or changing e2e, journey, UI, browser or API-level tests.
---

# End-to-end tests

## Two kinds

| | API e2e | UI e2e |
|---|---|---|
| Folder | `NestJS_Backend/test/e2e/` | `ReactTS_Frontend/e2e/` |
| Runner | Vitest + supertest, real app + `<DB_SCHEMA>_test` | Playwright |
| Auth | API keys from `test/e2e/support/actors.ts`; browser sessions with `signInAs(t, email)` from `support/sessions.ts` (test IdP signs SAML responses; Okta is never called) | `e2e/`: API mocked with `page.route`; `e2e-okta/`: real Okta dev tenant |
| Command | `npm run test:e2e` | `npm run test:e2e`, `npm run test:e2e:okta` |

The full-suite runner (`node scripts/run-full-suite.mjs`) runs these as steps 5, 10 and 11. New specs must sit in `NestJS_Backend/test/e2e/*.e2e-spec.ts`, `ReactTS_Frontend/e2e/*.spec.ts` or `ReactTS_Frontend/e2e-okta/*.spec.ts`, or the runner never sees them; check with `node scripts/run-full-suite.mjs --check-tests`. A new Playwright project or config needs its own step in the runner (see `tdd-cycle`). Okta journeys count as "not run" until the test users in `.env.e2e.local` are filled in.

## Browsers (UI)

The Playwright config uses the installed Edge on Windows (`channel: 'msedge'`; Playwright may not download browsers there). `PLAYWRIGHT_CHANNEL=chrome` overrides it to use an installed Google Chrome. Never add a step that downloads browsers. Projects run each journey at desktop (1440), tablet (768) and phone (375) widths.

## Login (UI)

- Screen journeys (`e2e/`) mock the API with `mockApi(page, permissions, handlers)` from `e2e/support/mock-api.ts` (signed in as a user holding exactly those permissions), so they need no backend or Okta. Run `expectNoA11yViolations` on each screen and with dialogs open.
- Real sign-in journeys (`e2e-okta/`, `playwright.okta.config.ts`) use `signInAtOkta(page, testUser('<ROLE>'))` and skip when that role's credentials are missing. When role journeys need it, add a setup project that signs in once per role and saves `e2e-okta/.auth/<role>.json` (git-ignore it).
- Credentials come from `.env.e2e.local` (git-ignored) — never from the repository or chat. Never sign in with real (non-test) accounts.

## Every journey needs

1. The positive path for the intended role.
2. At least one negative path: a role without permission sees no entry point and gets "Access denied" on the direct URL; invalid input shows the field error; a role without financial access (e.g. the seeded Vendor role) never sees financial values.
3. Accessibility: page has one `h1`, landmarks, and every control is reachable by keyboard.
4. No fixed waits: rely on `expect(...).toBeVisible()` auto-waiting.

## Selectors

`getByRole`, `getByLabel`, `getByText` only. Add `data-testid` only where no accessible name exists, and fix the accessibility gap instead when possible.

## Data

Each test creates what it needs through the API (or fixtures) with unique names, and does not depend on other tests' data or order.
