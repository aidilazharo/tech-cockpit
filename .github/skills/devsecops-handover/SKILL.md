---
name: devsecops-handover
description: Produces the build, test, migration and deployment hand-over document for the DevSecOps team that owns GitHub Actions and Azure App Service for TechCockpit — Node version, commands, environment variables and Key Vault secrets, database migration step, smoke tests, and security scans. Use when asked for deployment steps, pipeline requirements, CI/CD hand-over, or release notes for DevSecOps.
disable-model-invocation: true
---

# DevSecOps hand-over

The DevSecOps team owns the pipelines; we provide exact, verified steps. Verify every command locally before writing it down.

Write `docs/devsecops/handover.md` (update it if it exists) with these sections:

1. **Runtime**: Node major for production (24 LTS until App Service Node 26 is GA), App Service Linux, start commands (`node dist/main.js` for the API; frontend static build output `ReactTS_Frontend/dist`).
2. **Build and test per project** (in order, all must pass):
   - Backend: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run db -- check`, `npm run test:cov` (needs a PostgreSQL 15 service and a `_test` schema).
   - Frontend: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:cov`, `npm run test:e2e` (Playwright Chromium in CI).
3. **Security gates**: `npm audit --omit=dev` (fail on high/critical), OSV check script, licence check script (fail on denied), secret scanning.
4. **Database migration**: run `node dist/database/cli/db.js migrate` with the **migration login** before swapping the new version in; the app runs with the **app login**. Rollback = deploy previous version; migrations must be backward compatible (expand/contract).
5. **Configuration**: every variable from `NestJS_Backend/.env.example` with its source (App Service setting vs Key Vault reference), plus `DB_SSL=true` and production `FRONTEND_ORIGINS`. Never list secret values.
6. **Smoke tests after deploy**: `GET /api/v1/health` returns 200 `{ status: 'ok', database: 'up' }`; Swagger UI requires login.
7. **Changes since last hand-over**: new env vars, new migrations, new external endpoints.
