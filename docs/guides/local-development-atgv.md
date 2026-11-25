# Local development and ATGV Custom Stack compatibility

Tech Cockpit is a **multi-application repository**, not a single Vite project.
Keep the independently deployable applications in their existing folders:

| Application | Runtime | Source of truth |
| --- | --- | --- |
| `ReactTS_Frontend/` | React + TypeScript + Vite | `package.json`, `package-lock.json`, `vite.config.ts`, `index.html` |
| `NestJS_Backend/` | NestJS REST API + MikroORM/PostgreSQL | `package.json`, `package-lock.json`, `.env.example` |

This is a conventional multi-application repository layout. A root-level `vite.config.ts`,
dummy package, or framework-specific ATGV adapter **must not** be added just to satisfy
a scanner. ATGV must inspect each application's own manifest and executable entry point.

## Prerequisites

- Node.js 24 or later (see `.nvmrc`) and npm 11.
- Run installation within the selected application folder so its checked-in lockfile is used.
- Use a separate local environment; never commit `.env` files, tokens, production credentials,
  database dumps or real user data.
- Never copy `node_modules` across operating systems.

## ATGV Windows 11 x64 bundled development

The configured project checkout is `projects/tech-cockpit-system/repository/tech-cockpit/`
(with its own `.git`). Use ATGV's Pull Repository on main, then Custom Stack → Install & Run.
The repository's `vendor/windows-x64/` directory carries split, SHA-256-verified ZIP
archives for both applications. ATGV v0.1.32 or later restores these into each
application's ignored `node_modules/` directory before startup. The target machine
needs Windows x64 Node.js 24 and npm 11 on PATH, but no npm package installation.
Do not extract a standalone copy or use the old portable application script.

The bundle policy is fail-closed: if the archives are unpublished, invalid, or
no longer match either application's package manifest/lockfile, pull an updated
bundle from main. ATGV does not use npm install or npm ci as a fallback on Windows x64
for these applications. The build workflow installs dependencies only on the build
runner and commits the split files and installed-module inventories to main.
The checked-in dependency inventory CSV is an estimate from the lockfiles; the
generated per-application JSON files list the actual bundled module versions.

Backend PostgreSQL and authentication services still require valid local settings.
ATGV's synthetic preview is not evidence of real backend readiness.

## Normal development

Run each application separately, using its own lockfile and approved environment:

```powershell
cd ReactTS_Frontend
npm ci
npm run dev
# http://127.0.0.1:5173/
```

The backend needs explicitly configured database, authentication and other external services;
follow the root README and `NestJS_Backend/.env.example` before starting it.
A successful frontend response is **not** proof that backend integrations work.

## ATGV isolated mock preview

Choose **Custom Stack → ReactTS_Frontend → Install & Run**.

The ATGV extension should detect `ReactTS_Frontend/vite.config.ts` and its `dev: vite`
script, install dependencies, then start the frontend in a local-only mock mode.

- UI: `http://127.0.0.1:5173/`
- Mock API: synthetic responses supplied by ATGV, with no production database or credentials
- Optional API-only target: `NestJS_Backend`, verified at
  `http://127.0.0.1:3000/api/v1/health` in synthetic mode
- Mock responses are not representative of database migrations, real authentication,
  API integrations, security, or business correctness

ATGV supplies ephemeral mock overlays and synthetic fixtures **without changing**
the application's normal Vite or NestJS configuration. Any unsupported route must
fail clearly (HTTP 501), not silently forward traffic to a live API.

## Quality checks

Run from the relevant application directory:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

The frontend and backend must each pass their own checks. Frontend UI smoke tests
should verify a real page renders. API readiness checks should verify the appropriate
process and distinguish a synthetic response from a live backend.

## Architecture rules

1. Keep frontend and backend source, dependencies and startup scripts isolated.
2. Detect frameworks using their actual entry points/configuration and executable
   scripts, **never** a testing-only dependency such as Vite/Vitest in the backend.
3. Keep deployment/production settings separate from mock development configuration.
4. Preserve the repository's existing lockfiles and public API contracts.
5. Prefer industry-standard package scripts (`dev`, `start:dev`, `build`, `test`)
   over ATGV-specific executables or modified production code.
6. Treat screenshots/mock-preview readiness as **UI verification only**;
   do not approve production readiness on synthetic data.
