---
name: commit
description: Commits TechCockpit work as micro commits with Conventional Commit messages — quick checks before each commit, the full test suite once at the end of every code change (backend unit, integration and API e2e, frontend unit, 99% coverage gates, Playwright and Okta journeys), a git-ignored test report, the test status in every commit message and PR description, and a push only when everything passed. Use at the end of every code change, or when asked to commit, push, run the full test suite, report test results or prepare a pull request.
argument-hint: "[what was changed]"
---

# Commit: micro commits and the test gate

Decided with Terry on 2026-11-12. Never commit or push to `main`.

```
Commit progress:
- [ ] 1. Micro commits planned
- [ ] 2. Each step: quick checks, then a local micro commit
- [ ] 3. Full suite once, at the end
- [ ] 4. Report: chat, test-reports/ file, last commit message
- [ ] 5. Push only when asked: full suite again, a results commit, then push if PASSED
```

## 1. Plan the micro commits

Every commit is one logical step that builds and passes on its own, so a developer can roll back to any of them (`git revert <sha>`).

- Order, where it applies: migration and entity → backend logic → API (+ `openapi.json`) → web schemas and queries → screens → Playwright journey → docs.
- Tests go in the same commit as the code they test; a red test is never committed alone (`tdd-cycle`).
- Refactors, formatting and dependency bumps get their own commits, never mixed with a behaviour change.
- Stage only the step's files: `git add <paths>`.

## 2. Quick checks, then a local micro commit

In each project the step touches:

| Check                       | `NestJS_Backend`                          | `ReactTS_Frontend`                        |
| --------------------------- | ----------------------------------------- | ----------------------------------------- |
| Lint the changed files      | `npx eslint <files>`                      | `npx eslint <files>`                      |
| Types                       | `npm run typecheck`                       | `npm run typecheck`                       |
| Tests related to the change | `npx vitest run --project unit --changed` | `npx vitest run --changed --maxWorkers=1` |

A step that only touches Markdown, `.claude/skills`, `CLAUDE.md` or `.gitignore` needs no checks. If a check fails, fix it first; if you cannot, still commit, with the failure in the Tests block, and report it.

A step that adds, renames or moves a test file also runs `node scripts/run-full-suite.mjs --check-tests` (one second): it must say every test file is run by the suite. A test the suite never finds is a test that never runs (see `tdd-cycle`).

### Message

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) with the project's bullet body, a Tests block and the mandatory trailer:

```
<type>(<scope>): <summary, imperative, max 72 characters, no full stop>

- <what changed and why>
- <what changed and why>

Tests: <result of the quick checks, or of the full suite for the last commit>

Refs: #<issue or PR>               (optional)
BREAKING CHANGE: <what breaks>     (only when something breaks)
Co-authored-by: Copilot <copilot@github.com>
```

| Part  | Values                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| type  | `feat` new behaviour, `fix` bug fix, `test` tests only, `refactor` no behaviour change, `perf`, `docs`, `style` formatting only, `build` scripts, dependencies, tooling, `ci`, `chore`, `revert` |
| scope | `backend`, `frontend`, `db`, `api`, `sad`, `trm`, `approvals`, `rbac`, `auth`, `pmo`, `e2e`, `docs`, `skills`, `deps`, `git`                                                                     |

Tests block for a micro commit, one of:

```
Tests: quick checks passed (backend: lint, types, 14 unit tests)
Tests: quick checks FAILED: frontend unit "places a box in the first free slot" (expected 40, got 30)
Tests: not needed (documentation only)
```

Pass the message through a Git Bash heredoc (`git commit -F - <<'EOF' ... EOF`), or write it to `.git/AI_COMMIT_MSG.txt`, run `git commit -F .git/AI_COMMIT_MSG.txt`, then delete the file. Commit locally only.

## 3. Full suite, once at the end of every code change

Skip it only when the whole execution touched nothing but documentation (as above).

**Run the whole suite as one job**, so it costs one command and one summary line instead of dozens of polls:

```
cd /d D:\my-fow-technology-app-techassists
node scripts/run-full-suite.mjs            (add --record before a push; --only 1,2,6,7 for a subset)
```

Start it with the Bash tool using `run_in_background: true`, say what is running, and **end the turn: do not poll**. The completion notification brings the result; then read only its last line (`RESULT: ... report: <path>`) and the report file. Never loop on the output file, and never re-read logs or `status.txt` to see progress. When a progress check is wanted (the developer asked for one), the only way to poll is `node scripts/run-full-suite.mjs --status --after 5` in a foreground Bash call (set `timeout` above 5 minutes): it waits 5 minutes (earlier if the run finishes) and prints one line, `RUNNING: step n of 11 (...), x passed, y failed, last activity z min ago` or `FINISHED: <result> ... report: <path>`. The script runs the steps below in order, reruns Playwright failures once with `--last-failed --workers=1`, handles the database and Okta cases itself, writes `test-reports/<YYYY-MM-DD-HHmm>/` (logs, `status.txt`, `tests-block.txt`) and `test-reports/<YYYY-MM-DD-HHmm>.md`, and never pushes. It forces the upper-case drive letter.

The manual procedure it implements (use it only to run a single step by hand):

Create `test-reports/<YYYY-MM-DD-HHmm>/` at the repo root (git-ignored). Run the steps in order, one at a time, each writing to `<step>.log` in that folder. Keep going after a failure so the report is complete.

Run everything from the upper-case drive letter (`cd /d D:\my-fow-technology-app-techassists\...`). Started from `d:\...`, Vitest loads itself twice and every test file fails with "Vitest failed to find the runner".

| #   | Layer                                                    | Folder             | Command                                    |
| --- | -------------------------------------------------------- | ------------------ | ------------------------------------------ |
| 1   | Backend lint                                             | `NestJS_Backend`   | `npm run lint`                             |
| 2   | Backend types                                            | `NestJS_Backend`   | `npm run typecheck`                        |
| 3   | Backend build                                            | `NestJS_Backend`   | `npm run build`                            |
| 4   | Entities match migrations                                | `NestJS_Backend`   | `npm run db -- check`                      |
| 5   | Backend unit, integration and API e2e, 99% coverage gate | `NestJS_Backend`   | `npm run test:cov`                         |
| 6   | Frontend lint                                            | `ReactTS_Frontend` | `npm run lint`                             |
| 7   | Frontend types                                           | `ReactTS_Frontend` | `npm run typecheck`                        |
| 8   | Frontend build                                           | `ReactTS_Frontend` | `npm run build`                            |
| 9   | Frontend unit, 99% coverage gate                         | `ReactTS_Frontend` | `npx vitest run --coverage --maxWorkers=1` |
| 10  | Playwright journeys (desktop, tablet, phone)             | `ReactTS_Frontend` | `npm run test:e2e`                         |
| 11  | Real Okta sign-in                                        | `ReactTS_Frontend` | `npm run test:e2e:okta`                    |

Not a code failure, report as "not run" with the reason (it never blocks a commit):

- Steps 4 and 5 cannot reach the shared database (`ETIMEDOUT`, `ECONNREFUSED`, `ENOTFOUND`, sign-in errors): run `npm test` (backend unit only) instead, and report integration, API e2e and the backend coverage gate as not run.
- Step 11 when `ReactTS_Frontend/.env.e2e.local` does not exist, or its journeys skip themselves because their test users are not filled in.

The runner also reports, as warnings in the report and the Tests block, and never hides them:

- A test file the suite never runs (wrong name or folder). The result is INCOMPLETE until it is moved or renamed, or until a step for it is added to `scripts/run-full-suite.mjs`.
- A step that ran fewer tests than the last passing run (`test-reports/last-counts.json`). Right only when tests were removed on purpose; say so in the commit message.

Retries on this laptop:

- Playwright failures: rerun once with `npx playwright test --last-failed --workers=1` (a cold Vite server shows a blank page). A test that passes on the rerun is reported as flaky.
- A frontend unit test that times out at 15 s under load: rerun that file alone with `--maxWorkers=1`; passing means flaky.

Failures this execution caused: fix them in a new `fix(<scope>)` micro commit (quick checks first), then rerun the failed steps. Never weaken, skip or delete an existing test to get green. A failure you cannot fix, or that this change did not cause: stop and report it.

## 4. Report

Overall result:

| Result     | When                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PASSED     | Every step passed (flaky tests that passed on the rerun count as passed; step 11 not run for want of test users does not count against) |
| FAILED     | Any step failed                                                                                                                         |
| INCOMPLETE | Nothing failed, but steps 4–5 could not run, or a test file is never run by the suite                                                   |

Write `test-reports/<YYYY-MM-DD-HHmm>.md`:

```markdown
# Test report: <branch> @ <short sha>, <YYYY-MM-DD HH:mm> MYT

Result: PASSED | FAILED | INCOMPLETE

| #   | Layer | Result | Passed | Failed | Skipped or not run | Notes |
| --- | ----- | ------ | ------ | ------ | ------------------ | ----- |

## Failures

### <layer>: <test name>

- Where: <file:line>
- Error: <first useful error line>
- Likely cause: this change | environment | flaky | unknown
- Next step: <what the developer should do>

## Not run

- <layer>: <reason>

## Commits in this execution

- <sha> <subject>
```

Tell the developer in chat: the result, the table, every failure with its reason and likely cause, and where the report and logs are.

Put the full-suite result in the last commit of the execution: rewrite its message with `git commit --amend -F .git/AI_COMMIT_MSG.txt` (message only; allowed because it is not pushed yet). When fixes were needed, the last fix commit carries it.

```
Tests (full suite, <YYYY-MM-DD HH:mm>): PASSED | FAILED | INCOMPLETE
- Backend lint, types, build, db check: passed
- Backend unit, integration, API e2e: <n> passed, <n> failed; coverage <x>%
- Frontend lint, types, build: passed
- Frontend unit: <n> passed, <n> failed; coverage <x>%
- Playwright: <n> passed, <n> failed (<n> flaky)
- Okta sign-in: <n> passed, or not run (no .env.e2e.local)
- Failed: <layer> "<test name>": <reason>
```

## 5. Push and pull request

Commits stay local until the developer asks to push. On every push request:

1. Run the full suite again (section 3), even if it ran before: `node scripts/run-full-suite.mjs --record` runs it, writes the report and creates the record commit in one go (when it is not PASSED the commit still records the result; do not push).
2. The record commit has the subject `chore(git): record the full test suite before push`, the Tests block of section 4 as the body, then the trailer. By hand: `git commit --allow-empty -F .git/AI_COMMIT_MSG.txt`.
3. **PASSED**: push (`git push`, or `git push -u origin <branch>` the first time) and open the pull request with the full report in its description. If GitHub cannot be reached from the tools (the company proxy), give the developer the compare link and the description to paste.
4. **FAILED or INCOMPLETE**: do not push; report it and the developer decides. If they still ask to push, the pull request description starts with the report.

Pull request description: one-line summary, what changed, then the report (result, table, failures, not run).

## Rolling back

- One step: `git revert <sha>` (makes a `revert:` commit).
- Several steps: `git revert --no-edit <oldest>^..<newest>`.
- Never `git reset --hard` or force-push commits that are already pushed.
