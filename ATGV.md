# Running AIA TechCockpit in ATGV Custom Stack

This repository has **two independent npm applications**, plus proof-of-concept scripts.
Do **not** run or install from the repository root or select the `poc/` packages.

## ATGV one-click frontend preview (without corporate infrastructure)

1. In ATGV, select **Solution Architect > Custom Stack**, then select this Git repository and the `fix/atgv-tech-cockpit-runtime` branch.
2. Choose **Scan Repository**. Select the **ReactTS_Frontend** target (React / Vite).
3. Choose **Install Dependencies** if ATGV has not installed them. ATGV uses the frontend's own package-lock.json and `npm ci`.
4. Choose **Run / Start Server** using the detected `dev` script. ATGV supplies `VITE_ATGV_PROJECT` and `ATGV_PREVIEW_PORT` to the process.
5. Open the localhost preview (usually `http://127.0.0.1:5173/`). It starts using **synthetic read-only data**. Real Okta SAML, Azure PostgreSQL and other enterprise integrations are not contacted.
6. ATGV's standard **Stop Server** handles the dev-server process.

The demo intentionally displays a fixed **ATGV LOCAL PREVIEW - SYNTHETIC DATA** label. Unknown API requests return HTTP 501; mutations return HTTP 405 and are never forwarded to external services. This is a UI preview, not an integration or security-acceptance test.

The Vite plugin is automatically disabled outside an ATGV development run and when `NODE_ENV=production`. To use your configured real API *inside* ATGV instead of synthetic data, launch ATGV with `ATGV_TECHCOCKPIT_REAL_API=1` and make sure the NestJS backend is healthy at port 3000.

## Full local integration (real backend and database)

Require Node.js 24+, npm 11+, a reachable Azure PostgreSQL 15 database and Okta SAML IdP.

Backend (from `NestJS_Backend/`):

```bat
copy .env.example .env
rem Fill DB_HOST, DB_* credentials, SESSION_JWT_SECRET and SAML_IDP_METADATA_URL.
npm ci
npm run db -- migrate
npm run bootstrap:admin -- --username your.okta.username --email you@example.com
npm run start:dev
```

Frontend (from `ReactTS_Frontend/`, outside ATGV, or with the real-API opt-out above):

```bat
npm ci
npm run dev
```

Check `http://localhost:3000/api/v1/health` for database-connected API readiness and `http://localhost:5173/` for the frontend. Signing in requires a configured Okta tenant.

Run local ATGV preview tests without external dependencies: `node --test ReactTS_Frontend/scripts/atgv-preview.test.mjs`, from the repository root.

## Important distinction

ATGV's **generic Mock Preview** can show different, limited sample API routes. The repository-native ATGV mode described here works with **normal Run/Start Server** and supports TechCockpit's own application list, filters and detail preview.
