---
name: code-review
description: Reviews the current TechCockpit branch before a commit or pull request — correctness, tests and coverage, backend and frontend rules, a security pass (OWASP API Top 10, access rules, classified data, vendors), simplification, docs and dependency hygiene. Reports findings by severity with file and line; changes nothing unless asked. Use when asked to review code, review the branch or a PR, check changes before committing, or "code review".
argument-hint: "[base branch, default origin/main]"
---

# Code review

Read-only: report findings; fix only what the user asks for.

```
Review progress:
- [ ] 1. Scope: what changed
- [ ] 2. Read every change in context
- [ ] 3. Checklist below, per area touched
- [ ] 4. Checks run (or why not)
- [ ] 5. Report
```

## 1. Scope

From the repo root: `git status --short`, then `git diff <base>...HEAD --stat` and `git diff <base>...HEAD` (base: what the user gave, else `origin/main`; run `git fetch` first if it may be stale). Include uncommitted changes. Read the related spec in `docs/modules/` and the decisions in `docs/requirements-decisions.md` for the area.

## 2. Read in context

Open each changed file around the change, plus its callers and tests. Judge behaviour, not only the diff lines.

## 3. Checklist

**Correctness**: edge cases (empty, null, boundaries such as RM249,999.99 / 250,000), error paths, state transitions, optimistic locking (`version` → 409), time zones (Malaysia dates), anything the spec says that the code does not do, or the reverse.

**Tests** (`tdd-cycle`): each new behaviour has a test, positive and negative (no permission, wrong scope, invalid input, wrong state, vendor and classified data); tests named by behaviour; UI queried by role and name; no sleeps; no test written only to touch a line; coverage stays ≥ 99%.

**Backend** (`.github/instructions/backend.instructions.md`): every route declares `@RequirePermission` / `@Authenticated(reason)` / `@Public(reason)`; Zod in (`.strict()`) and out (`@ZodResponse`, status matches `@HttpCode`); scope checked in the service against the record; classified fields through `FieldClassService`; audit after commit; no notifications inside a transaction; no state change on GET; entities use `WILDCARD_SCHEMA` and are listed in `entities.ts`; migrations reviewed (`db-migration`); `openapi.json` regenerated and the web app's contract tests updated after any API change (`api-contract`).

**Frontend** (`.github/instructions/frontend.instructions.md`): Qi tokens only; interactive parts on Base UI; data through `api(path, { schema })` + TanStack Query; pages guarded in `routes.tsx` and hidden with `useCan`; all text through i18n keys; money with `formatMyr`, `null` financial values as "Restricted"; dates in Malaysia time; statuses with icon + text; WCAG 2.2 AA (one `h1`, names, keyboard, focus visible, targets ≥ 24 px); works in light/dark and at tablet and phone widths.

**Security pass**: object- and property-level authorisation (could another role, another scope or a vendor read or change this?); injection (string-built SQL, `dangerouslySetInnerHTML`, dynamic imports); uploads; SSRF; secrets, tokens or personal data in code, logs, audit metadata or tests; real (non-synthetic) data anywhere. Changes to sign-in, sessions, authorisation, cryptography or personal-data handling: say "Human security review is required before merge or deployment."

**Simplicity**: duplicated logic that an existing helper already does; dead code and impossible branches; abstractions used once; comments that restate the code; changes beyond what was asked.

**Docs and config**: module spec and decisions updated when behaviour or a decision changed; instructions and skills updated when structure, commands or rules changed; new env vars in `.env.example`.

**Dependencies**: any new package is the latest stable, maintained, open-source licensed, has a JavaScript or WebAssembly build (no native-only tools), and is flagged "Requires AppSec review".

**Git**: not on `main`; no stray files (logs, coverage, `dist`, `.env`, test results); commit messages follow `.github/copilot-instructions.md`.

## 4. Checks

In each project touched: `npm run lint` and `npm run typecheck`, then the changed test files (`npx vitest run <files>`; on the Windows laptop add `--maxWorkers=1`). Also run `node scripts/run-full-suite.mjs --check-tests`: a new or moved test file the suite never runs is a **Blocker**. Say which checks you ran and which you skipped and why (e.g. the shared database is unreachable).

## 5. Report

Group findings by severity, each with `file:line`, what goes wrong and for whom, and a concrete fix:

| Severity | Meaning                                                                        |
| -------- | ------------------------------------------------------------------------------ |
| Blocker  | Wrong behaviour, data or permission leak, failing check, missing required test |
| Major    | Rule broken (see above), likely bug, missing negative case                     |
| Minor    | Clarity, naming, small duplication                                             |
| Nit      | Optional polish                                                                |

End with the checks run, open questions for the user, and whether the branch is ready for a pull request.
