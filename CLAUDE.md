# AIA TechCockpit

Enterprise technology one-stop centre: TRM (+ SAD, ServiceNow sync), PMO (business case → monthly reporting → closure, approval centre), Tech Control Tower, vendor management.

- Decisions and scope: `docs/requirements-decisions.md` (source of truth — read before designing anything). Research: `docs/research/`.
- Coding agent: Claude Code is the default. Only when Claude is not available, GitHub Copilot (local) is used with `.github/copilot-instructions.md`; keep both rule sets in step.
- Ask the user before assuming any requirement; never guess fields, approvers, visibility rules or statuses.

## Layout

| Folder | What | Instructions |
|---|---|---|
| `NestJS_Backend/` | NestJS 12 API (ESM), MikroORM 7, PostgreSQL 15, Zod, Vitest | `NestJS_Backend/CLAUDE.md` |
| `ReactTS_Frontend/` | React 19, Vite 8, Tailwind 4, AIA Qi components on Base UI, Vitest, Playwright | `ReactTS_Frontend/CLAUDE.md` |
| `.claude/skills/` | How we build here — use them | see below |
| `docs/` | Decisions, research, module specs, security reports | |

## Skills (use them; they encode the rules)

| Skill | When |
|---|---|
| `/new-module` | Any new module, entity, CRUD API or data-backed screen |
| `/rbac-approvals` | Permissions, roles, data visibility, approval workflows/rules |
| `/api-contract` | Any endpoint or DTO |
| `/db-migration` | Any entity/table change |
| `tdd-cycle` | Always (test first) |
| `/e2e-tests` | API (supertest) and UI (Playwright) end-to-end tests |
| `/ui-screen`, `/qi-component` | Frontend screens and Qi components |
| `/servicenow-sync` | ServiceNow exports → TRM sync (CLI, sync runs, mapping, missing records) |
| `/code-review` | Review the branch before a commit or pull request |
| `/commit` | End of every code change: micro commits, full test suite, test report, push |
| `/security-review-full`, `/refresh-deps`, `/security-and-deps` | Security review, dependency refresh, both + regression |
| `/devsecops-handover` | Pipeline / deployment steps for the DevSecOps team |

## Non-negotiables

- TDD: failing test first; positive AND negative cases; coverage ≥ 99% on lines, statements, functions and branches (build fails below; raised from 95% on 2026-10-23).
- API-first: Zod schemas + OpenAPI; regenerate `NestJS_Backend/openapi.json` after API changes.
- Security: every route declares an access rule (fail-closed guard); vendors see financial, contract or personal data only when their role grants it (the seeded Vendor role grants none; roles decide since 2026-10-22, see `docs/modules/rbac-configurable.md`); vendors can never be system administrators; no secrets in code, logs or chat.
- Machine: development is on the **Windows company laptop only** (since 2026-10-27; the MacBook is no longer used). It has **no Docker and no PowerShell** (cmd + Git Bash) and uses the shared Azure PostgreSQL 15.19 with `DB_SCHEMA=tc_<name>`. Scripts must be Node `.mjs`/TypeScript, never PowerShell.
- Setup is `git clone` then a plain `npm ci` in each project (never share `node_modules`). The Windows laptop's network may reset native Windows binaries (`.exe`, `.node`), so every dev tool needs a JavaScript or WebAssembly build (esbuild-wasm, ESLint). One exception (Terry, 2026-10-26): Vite/Vitest/Tailwind use native Windows packages; if their download is reset, copy the ones already on the disk (never download) with `node scripts/windows-native-bindings.mjs` after `npm ci --omit=optional`. Vite is pinned (8.1.6) for that. See `docs/requirements-decisions.md` §11 and §12.
- Libraries: latest **stable**, actively maintained, open-source licences only; never install pre-releases (the approved exceptions are listed in `docs/requirements-decisions.md` §12).
- Production runs Node 24 LTS (code must stay Node 24 compatible); local Node 26 is fine.
- Terminal on the laptop: a one-off cmd command sometimes fails with `'npx' is not recognized` or `'git' is not recognized`; rerun it, or use a long-running terminal and redirect output to a git-ignored `*.log` file for long runs.
- CI/CD (GitHub Actions) is owned by the DevSecOps team; we hand over steps.

## Git: micro commits, tests, push and commit messages

Decided with Terry on 2026-11-12; the step-by-step procedure is the `/commit` skill.

- Never commit or push to `main`. Work on a feature branch (`feature/<topic>`); every change reaches `main` through a pull request.
- **Micro commits**: one logical step per commit that builds and passes on its own (tests in the same commit as their code; refactors, formatting and dependency bumps separate), so a developer can roll back any step with `git revert <sha>`. Commit locally on your own.
- **Quick checks before each micro commit** (option B): lint the changed files, type-check, run the unit tests related to the change. Documentation-only steps need none.
- **Full suite once at the end of every code change**: backend lint, types, build, db check, unit + integration + API e2e with the 99% coverage gate; frontend lint, types, build, unit tests with the 99% coverage gate, Playwright journeys (desktop, tablet, phone) and, when `.env.e2e.local` exists, the real Okta journeys.
- **Failures and tests that could not run never block a commit**, but they are always reported: in chat (test, reason, likely cause), in a git-ignored report in `test-reports/`, in the commit message and in the pull request description.
- **Push only when Terry asks, and only when the full suite passed.** Before every push the full suite runs again and its result goes into an additional commit. Otherwise the commits stay local and Terry decides; a pull request opened anyway starts with the test report.
- Commit messages follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), with a bullet body, a Tests block and the mandatory trailer:

```
<type>(<scope>): <summary, imperative, max 72 characters, no full stop>

- <what changed and why>
- <what changed and why>

Tests: <quick checks result, or the full-suite result on the last commit>

Co-authored-by: Copilot <copilot@github.com>
```

Types: `feat`, `fix`, `test`, `refactor`, `perf`, `docs`, `style`, `build`, `ci`, `chore`, `revert`. Scopes: `backend`, `frontend`, `db`, `api`, `sad`, `trm`, `approvals`, `rbac`, `auth`, `pmo`, `e2e`, `docs`, `skills`, `deps`, `git`. Add `BREAKING CHANGE: <what breaks>` above the trailer when something breaks.
