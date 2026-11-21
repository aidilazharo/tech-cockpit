---
name: Backend (NestJS_Backend)
description: "TechCockpit NestJS API rules: commands, folder structure, access rules on every route, Zod input/output, audit, MikroORM entities, SAML, approvals. Use when working on NestJS_Backend code, tests, migrations or scripts."
applyTo: "NestJS_Backend/**"
---

# NestJS_Backend

NestJS 12 (ES modules), MikroORM 7 (`defineEntity`, wildcard schema), PostgreSQL 15, Zod 4, Vitest 4, ESLint + typescript-eslint (type-aware).

## Commands (work in Git Bash and cmd)

| Task                             | Command                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrate your schema              | `npm run db -- migrate`                                                                                                                                                                                                                                                                        |
| New migration                    | `npm run db -- create <kebab-name>` (then review the SQL)                                                                                                                                                                                                                                      |
| Entities vs migrations           | `npm run db -- check`                                                                                                                                                                                                                                                                          |
| Dev server                       | `npm run start:dev` (http://localhost:3000/api/v1/...). `start`, `start:dev` and `start:debug` run node with `--use-system-ca` (the company laptop needs the Windows certificate store to fetch Okta's metadata; without it sign-in shows "Sign-in is unavailable"). `start:prod` is unchanged |
| First admin + API key            | `npm run bootstrap:admin -- --username <okta username> --email <e> [--first-name <f> --last-name <l>]`                                                                                                                                                                                         |
| Load ServiceNow exports into TRM | set `TECHCOCKPIT_API_KEY`, then `npm run trm:sync -- --dir <folder> [--dry-run] [--api <url>]`                                                                                                                                                                                                 |
| Unit / integration / e2e         | `npm test` / `npm run test:int` / `npm run test:e2e`                                                                                                                                                                                                                                           |
| Everything + 99% gate            | `npm run test:cov`                                                                                                                                                                                                                                                                             |
| Lint / types / build             | `npm run lint` / `npm run typecheck` / `npm run build`                                                                                                                                                                                                                                         |
| OpenAPI file                     | `npm run openapi` (writes `openapi.json`; an e2e test fails if stale)                                                                                                                                                                                                                          |

`tsx` runs the DB CLI and scripts, through `scripts/tsx.mjs` (it seeds Node's random generator first: on the Windows laptop with Node 26, esbuild-wasm otherwise stops with `ERR_OSSL_ENTROPY_SOURCE_STRENGTH_TOO_WEAK`); anything that boots Nest (DI needs decorator metadata) runs from `dist/`.

On the Windows laptop, integration and e2e tests need the shared Azure PostgreSQL (`<DB_SCHEMA>_test`); `connect ETIMEDOUT` means the network cannot reach it, not a code failure. They are slow there (the SAD e2e file takes about 8 minutes): run one file at a time, e.g. `npx vitest run --project e2e test/e2e/<file>.e2e-spec.ts`.

## Structure

```
src/
  app.factory.ts          createApp(): helmet, CORS, /api prefix, URI versioning, problem+json, protected Swagger
  app.module.ts           PlatformModule (global: audit, access, api keys) + business modules; global guards/interceptors
  config/                 env.ts (Zod-validated env), env.module.ts (ENV token)
  common/http/            problem+json filter, request id, pagination, success-status
  common/zod/             ZodBody/ZodQuery/ZodParam/ZodResponse + validation pipe + response serializer
  database/               orm-config (per login: password or an Entra ID token from `az login`, entra-token.ts; optional DB_APP_ROLE the app
                          login switches to as it connects), entities list, migrator subclass, migrations/, cli/db.ts, RLS helper
  modules/
    access/               permission catalogue, Principal, data visibility, guards, decorators, roles/users/assignments,
                          field classification (FieldClassRegistry: modules register classified fields; admins override classes), acting-for-staff
    api-keys/             personal API keys (hash-only storage)
    audit/                append-only audit log, interceptor (every authenticated request), search API
    approvals/            pure engine (domain/), registry, rule sets, approval service, escalation, controllers; event log (approval_event:
                          submitted, decisions, questions, answers, resubmitted, cancelled, as they happened); submitIn/resubmitIn/cancelIn
                          run inside a module's transaction (record and approval change together); a type may resubmit through its module
    auth/                 Okta SAML sign-in (metadata, SAML checks; only added users, by Okta username; refused sign-ins recorded), sessions (JWT access + rotating refresh cookies), CSRF origin check
    notifications/        in-app notifications (90-day retention), /me/notifications; approval events in approvals/domain/notifications.ts
    identity/             User (Okta username, email, names, vendor flag: managed in the app), Department, RefusedSignIn entities
    portfolios/           minimal portfolio list (system admins); PMO extends it
    trm/                  Technology Reference Model: domain/ (pure sync plan, mapping, capability tree, name matching, field classes),
                          sync service (staged runs, one-transaction apply), catalogue service (scoped visibility, masking), cli/ (sync client),
                          trm-visibility (who sees which applications; shared), structure service (domains, layers, landscape/technology views),
                          removal service (admins remove records a complete export no longer contained; refuses records in use),
                          roadmap service (EA initiatives, planned applications; owners must hold a role that can act for staff)
    sad/                  SAD: domain/ (template as data (version 3; removed questions per section; asked-once questions printed twice), answer validation,
                          visibility/completeness, personal data, rich text (headings, tables, font sizes), diagram slots, history.ts (Version Control rows
                          from approval events), local-auth.ts (the local authentication flag)), frozen retention rows at submit, a five-minute job that
                          puts right versions their approval moved on without,
                          SAD service (drafts, section saves, diagrams, submit/resubmit, approval outcomes, API inventory), TRM loader, retention list,
                          diagram defaults (hosting names), PDF (pdfmake: sad-pdf.ts layout, sad-pdf-diagrams.ts diagram pages and tables, sad-pdf-svg.ts draws diagrams as SVG,
                          sad-pdf-icons.ts reads the API's copy of the Azure icons in azure-icons/ (copied into dist by nest-cli.json), sad-pdf-render.ts pdfmake with no outside access); domain/infrastructure.ts + azure-regions.ts (infrastructure diagram rules); domain/mapping.ts (calls between applications on approved solution diagrams); domain/process.ts (CI and CD flow rules); domain/monitoring.ts (monitoring diagram rules); domain/uploads.ts (file rules), sad-uploads.service/controller + sad-upload-files (files under diagrams, carried into drafts, scan checks)
    storage/              where uploads are kept: local folder (development) or Azure Blob Storage via managed identity (deployed; Defender scan verdicts from blob index tags); FILE_STORAGE token
    health/               public health probe
  scripts/                bootstrap-admin, generate-openapi, trm-sync
test/
  integration/            real PostgreSQL in <DB_SCHEMA>_test
  e2e/                    full app over HTTP (supertest); support/app.ts (Okta replaced by a stub), actors.ts,
                          test-idp.ts (signs SAML responses with a key generated at run time), sessions.ts
  fixtures/saml/          Okta-shaped metadata with a public test certificate (no private key)
```

## Rules that are easy to break

- Every route: `@RequirePermission(code)`, or `@Authenticated(reason)` / `@Public(reason)`. Undeclared routes are refused.
- Inputs only through `@ZodBody/@ZodQuery/@ZodParam` (`.strict()` bodies); outputs through `@ZodResponse` (unknown fields stripped; mismatches fail closed with 500).
- Services check scope against the record (`principal.can(code, scope)`) and mask classified fields (`maskClassified`).
- Record changes with `AuditService.recordChange` **after** the commit; views are recorded automatically.
- Entities: `schema: WILDCARD_SCHEMA`, spread `baseProperties()`, add to `src/database/entities.ts`. Never hard-code a schema name.
- Use `this.em.fork()` (or a request context) in services called outside HTTP (scheduler, tests).
- Browser sessions: cookie-authenticated POST/PUT/PATCH/DELETE need an `Origin` from FRONTEND_ORIGINS/API_BASE_URL (AuthGuard). Never add a route that changes state on GET.
- SAML: keep every check in `SamlService.completeLogin` (node-saml 5.1 skips issuer, Destination and Recipient for sign-in); add a refused-response e2e case for any new rule.
- Polled endpoints that return no business data may use `@SkipRequestAudit(reason)`; everything else is audited on every request.
- Never notify inside a transaction: compute after commit (see `ApprovalService.sendNotifications`); notification failures must never fail the business action.
- Approvals: workflow types are registered in code (`ApprovalWorkflowRegistry`); rules are data (maintenance API).
