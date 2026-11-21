---
name: api-contract
description: API-first rules for the TechCockpit REST API — URL and versioning conventions, Zod request/response schemas, OpenAPI documentation through @ZodBody/@ZodQuery/@ZodParam/@ZodResponse, RFC 9457 problem+json errors, pagination, security requirements from the OWASP API Top 10, and regenerating the OpenAPI spec. Use when designing, adding or changing any API endpoint or DTO.
---

# API contract

Design the contract first, agree it with the user for anything new, then implement test-first.

## Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1/<resource>` — plural kebab-case nouns (`/api/v1/approval-tasks`) |
| Versioning | URI version (`version: '1'` on the controller). Breaking change → new version; keep the old one until clients move. |
| Methods | GET read, POST create or action (`/approval-tasks/{id}/approve`), PATCH partial update, PUT full replace (rare), DELETE remove |
| Ids | UUID path params, validated with `@ZodParam('id', z.uuid())` |
| Lists | `?page=1&pageSize=25` (max 100), `sort=field:asc`, filters as named query params; response `{ items, page, pageSize, total }` |
| Dates | ISO 8601 UTC strings |
| Money | decimal strings (`"249999.99"`), currency MYR |
| Concurrency | updates send `version`; mismatch → 409 |
| Errors | `application/problem+json`: `{ type, title, status, detail, instance, errors? }` (handled globally) |

## Implementing an endpoint

1. Schemas in `<module>.schemas.ts`: request bodies `.strict()`, every response field explicit, `.meta({ id: 'Name' })` for a named OpenAPI component.
2. Controller: `@RequirePermission`, `@ZodBody/@ZodQuery/@ZodParam` for inputs, `@ZodResponse({ status, schema, description })` for each success status (actions use `@HttpCode(200)`), `@ApiTags`, `@AuditResource`.
3. The response interceptor parses the return value through the response schema: unknown fields are stripped, so entities can never leak columns.
4. e2e tests for success and every error status the route can return.

## Security requirements (OWASP API Top 10)

- API1/API3: object- and property-level authorisation in the service; classified fields masked.
- API2: authentication required by default (global guard).
- API4: global rate limit; body size limit; `pageSize` capped.
- API5: function-level permission on every route.
- API6: approval and other business flows enforce state transitions server-side.
- API8: Helmet, CORS allowlist, no stack traces in errors.
- API9: every route documented; no undocumented or debug routes.

## OpenAPI output

- Swagger UI: `/api/docs` (login + `system:api-docs:read`).
- Spec file: `npm run openapi` writes `NestJS_Backend/openapi.json` (committed). A test fails if the committed spec differs from the running app, so always regenerate after API changes.
- Named schemas (`.meta({ id })`) become `components.schemas.<id>`; a request-side variant whose shape differs (defaults, transforms) is `<id>Input`. Two different schemas with the same id fail the build. Dates are documented as `string` / `date-time`. Recursive schemas need an id.
- The frontend keeps its own Zod schemas per resource (`ReactTS_Frontend/src/features/<feature>/schemas.ts`) and a contract test compares them with `openapi.json` (fields, required, nullability, enums). After an API change, regenerate the spec and fix what that test reports.
