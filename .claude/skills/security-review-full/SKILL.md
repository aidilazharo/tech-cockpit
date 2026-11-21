---
name: security-review-full
description: Full security review of the TechCockpit source (NestJS backend, React frontend, CLI tools) against OWASP ASVS Level 2 and the OWASP API Security Top 10, plus dependency vulnerability (npm audit + OSV) and licence checks. Produces a dated report in docs/security/. Use when asked for a security review, security findings, vulnerability scan, or before a release or hand-off.
disable-model-invocation: true
allowed-tools: Bash(node .claude/skills/security-review-full/scripts/*) Bash(npm audit*) Read Grep Glob
---

# Full security review

Read-only: report findings, do not fix them unless the user asks. Work through every phase.

```
Security review progress:
- [ ] 1. Dependency vulnerabilities (both projects)
- [ ] 2. Licences (both projects)
- [ ] 3. Source review against the checklist
- [ ] 4. Secrets scan
- [ ] 5. Report written to docs/security/YYYY-MM-DD-security-review.md
```

## 1. Dependencies

For `NestJS_Backend` and `ReactTS_Frontend` (and any other folder with a package-lock.json):

```bash
npm audit --omit=dev --prefix <dir>
npm audit --prefix <dir>
node .claude/skills/security-review-full/scripts/osv-check.mjs <dir>
```

Any finding in a production dependency is High priority regardless of the advisory's own rating until analysed.

## 2. Licences

```bash
node .claude/skills/security-review-full/scripts/licence-check.mjs <dir>
```

Exit 1 = a denied licence (GPL/AGPL/SSPL/BUSL) in a production dependency: blocking. MPL-2.0 is approved for dev/build-time packages only. Other "review" items (MPL at runtime, LGPL, missing licence) need a decision from the user; list them.

## 3. Source review

Use [reference/checklist.md](reference/checklist.md). Focus first on the highest-risk areas for this system: broken object- and property-level authorisation (financial data leaking to the wrong role or to vendors), approval actions by non-assignees, API key handling, file uploads, and SAML sign-in (`SamlService.completeLogin`). For every finding record: file:line, what an attacker can do, severity (Critical/High/Medium/Low), and a concrete fix.

## 4. Secrets

Search tracked files for credentials: `git grep -nE "(password|secret|api[_-]?key|token|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)" -- ':!*.md' ':!*.example'` and inspect each hit. `.env` files must be git-ignored; only `*.example` files are committed.

## 5. Report

Write `docs/security/YYYY-MM-DD-security-review.md`: summary table (counts by severity), findings sorted by severity, dependency and licence results, items needing a user decision. Then summarise the top findings to the user.
