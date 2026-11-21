---
name: security-and-deps
description: Runs the full TechCockpit hygiene cycle in one go — security review, dependency refresh to latest stable, then the full regression test suite. Use when the user asks for the combined security + dependency + regression run, a pre-release check, or "security and deps".
disable-model-invocation: true
---

# Security, dependencies and regression

Run in this order. Stop and report if a phase finds a blocking problem.

1. **Security review**: follow the `security-review-full` skill completely (report in `docs/security/`).
2. **Dependency refresh**: follow the `refresh-deps` skill (patch/minor applied, majors listed for approval).
3. **Second security pass on dependencies only**: rerun `npm audit` and `osv-check.mjs` for both projects, because step 2 changed the lockfiles.
4. **Full regression** in both projects (commands in `refresh-deps` step 3), including Playwright e2e.
5. **Summary to the user**: security findings by severity, upgrades applied, majors awaiting approval, regression result (pass/fail with failing test names), and anything needing a decision.
