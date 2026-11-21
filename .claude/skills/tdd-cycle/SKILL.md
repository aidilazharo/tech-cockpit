---
name: tdd-cycle
description: Enforces test-driven development for all TechCockpit code — write a failing test first, confirm it fails for the right reason, write the minimum code to pass, refactor while green — with positive and negative cases and a 99% coverage gate. Use whenever writing or changing production code in the backend, frontend or CLI tools.
user-invocable: false
---

# Test-driven development

## The cycle (every behaviour change)

1. **Red**: write one test for the next behaviour. Run it. It must fail, and the failure message must be the expected one ("not implemented", wrong value). A test that fails for a different reason (import error, typo) is not red yet.
2. **Green**: write the least code that makes it pass. Run the file's tests.
3. **Refactor**: improve names and structure with all tests green. Run again.
4. Repeat. Commit only green.

Never write production code without a failing test that needs it. Bug fixes start with a test that reproduces the bug.

## What every feature needs

| Layer | Tool | Location | Must cover |
|---|---|---|---|
| Pure logic | Vitest | `*.spec.ts` beside the code | every branch; boundaries (e.g. RM249,999.99 / 250,000 / 250,000.01) |
| Services | Vitest + fakes | `*.spec.ts` | success, each error path, permission and scope denial |
| Database behaviour | Vitest integration | `NestJS_Backend/test/integration/*.int-spec.ts` | constraints, RLS, migrations |
| API | Vitest + supertest | `NestJS_Backend/test/e2e/*.e2e-spec.ts` | the P/V rows of the rbac-approvals test matrix |
| Components | Vitest + Testing Library | `*.test.tsx` beside the component | rendering, states, keyboard use, accessible names |
| User journeys | Playwright | `ReactTS_Frontend/e2e/*.spec.ts` | positive journey and negative (forbidden, invalid input) |

**Negative cases are mandatory**: invalid input, missing permission, wrong scope, wrong state transition, vendor access to restricted data.

## New tests must be ones the full suite runs

Test files are found by name and folder (the table above; `include` in the Vitest configs, `testDir` in the Playwright configs). A test in another place or with another name is **silently never run**, so it can fail in production without any red build.

- Name and place new test files exactly as in the table. Backend `*.test.ts` or frontend `*.spec.tsx` are wrong.
- After adding or moving a test file, run `node scripts/run-full-suite.mjs --check-tests` (takes a second): it lists every test file no step would run, and exits non-zero when there is one.
- A new KIND of test (a new project or folder, a new runner, a new command) needs a step in `STEPS` and a pattern in `RUN_BY` in `scripts/run-full-suite.mjs`, in the same commit, plus a row in the `/commit` skill's step table. Without it the suite does not run it.
- The runner warns when a step runs fewer tests than the last passing run (deleted, moved or skipped tests). Fewer tests is only right when you removed them on purpose; say so in the commit message.

## Test style

- Name tests by behaviour: `it('returns 403 when a product manager reads another stream')`.
- Arrange / act / assert, one behaviour per test. `it.each` for tables of boundaries.
- Query UI by role and accessible name (`getByRole('button', { name: 'Submit' })`), never by CSS class.
- No sleeps; use fake timers or Playwright's auto-waiting.
- Tests never use production or shared working schemas: DB tests run in `<DB_SCHEMA>_test`, reset per run.

## Commands

| | Backend (`NestJS_Backend`) | Frontend (`ReactTS_Frontend`) |
|---|---|---|
| One file, watch | `npx vitest <path>` | `npx vitest <path>` |
| Unit | `npm test` | `npm test` |
| Integration | `npm run test:int` | — |
| API / UI e2e | `npm run test:e2e` | `npm run test:e2e` |
| Coverage gate (99%) | `npm run test:cov` | `npm run test:cov` |

Coverage below 99% (lines, statements, functions and branches) fails the build. Exclusions are only for generated code and process entry points, each with a comment in the Vitest config explaining why.

Cover real paths (errors, empty and missing values, retries, paging, cancelled dialogs). Never write a test only to touch a line. A branch that cannot happen is dead code: remove it (with a comment saying why the value is always there), rather than testing around it. The few that remain are TypeScript-generated decorator branches and implicit `switch` fall-throughs.
