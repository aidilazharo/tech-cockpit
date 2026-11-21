---
name: refresh-deps
description: Refreshes npm dependencies of the TechCockpit backend and frontend to the latest stable versions — applies patch and minor upgrades automatically, reports major upgrades with breaking-change notes for approval, flags unmaintained packages, then runs the full regression. Use when asked to update, upgrade or refresh libraries or dependencies.
disable-model-invocation: true
---

# Refresh dependencies

Policy: latest **stable** only, and only versions published **at least 7 days ago** (cooldown against compromised or withdrawn fresh releases). Never install a pre-release (`-rc`, `-beta`, `-next`), even if npm's `latest` tag points at one; the approved exceptions are listed in `docs/requirements-decisions.md` §12. Patch and minor: apply. Major: report, apply only after the user approves each one.

Exception: if a security fix exists only in a version newer than the cooldown, ask the user whether to take it now.

```
Refresh progress:
- [ ] 1. Report for each project
- [ ] 2. Apply patch/minor
- [ ] 3. Regression (stop at first failure)
- [ ] 4. Major upgrades: breaking-change notes, ask the user
- [ ] 5. Summary
```

## 1. Report

For `NestJS_Backend` and `ReactTS_Frontend`:

```bash
node .github/skills/refresh-deps/scripts/outdated-report.mjs <dir>
```

## 2. Apply patch/minor

Run the printed `npm install ...` command inside that folder. Then `npm audit` must report 0 vulnerabilities.

Pinned on purpose (never bump the major without the user):

- `@types/node`: must match the **production** Node major (24 until App Service runs Node 26 GA).
- `typescript`: check NestJS and typescript-eslint support before any major.
- `vite` (both projects) is pinned **exactly** (8.1.6): the Windows laptop runs the native rolldown binding already on its disk (1.1.5), and Vite 8.1.x depends on rolldown `~1.1.5`. Do not bump Vite past that unless a newer native binding was put on the disk (docs §11, §12). After any change to Vite, Vitest or Tailwind, run a plain `npm ci` in the project and `npm test`. Only if the Windows laptop's network resets the native tarballs (`ECONNRESET`), run `npm ci --omit=optional` and then `node scripts/windows-native-bindings.mjs` from the repo root (the script refuses a version that does not match).
- Native-only tools are not allowed (see the Windows laptop rule in `.github/copilot-instructions.md`); a new dev tool needs a JavaScript or WebAssembly build.

## 3. Regression

Backend (`NestJS_Backend`): `npm run lint && npm run typecheck && npm run build && npm run db -- check && npm run test:cov`
Frontend (`ReactTS_Frontend`): `npm run lint && npm run typecheck && npm run build && npm run test:cov && npm run test:e2e`

If anything fails, find which upgrade caused it (bisect by reverting package.json/package-lock.json one package at a time), keep the others, and report the culprit.

## 4. Majors

For each major: read the package's changelog/release notes, list breaking changes that affect our code (grep for affected APIs), estimate the change, and ask the user whether to proceed. After approval, upgrade one major at a time and rerun step 3.

## 5. Summary

Report: upgraded packages (from → to), majors waiting for approval with notes, packages with no release in 18+ months (suggest maintained alternatives), audit results.
