# Source review checklist (OWASP ASVS L2 + API Security Top 10, tailored)

## Contents
- Authorisation
- Authentication and sessions
- Input, output and injection
- Files
- Data protection
- Configuration and errors
- Logging and audit
- Frontend

## Authorisation (API1, API3, API5 — highest risk here)
- [ ] Every controller route has `@RequirePermission`, or `@Authenticated(reason)` / `@Public(reason)` with a convincing reason (the guard refuses undeclared routes).
- [ ] Services check scope against the actual record (`principal.can(code, scope)`), not only the guard.
- [ ] Lookups by id never return records outside the caller's scope (404/403, no data).
- [ ] Classified fields go through the field classification (`FieldClassService` / `canViewField`) or `maskClassified` / `canViewClass`; no hard-coded class in a service. Vendors (`isExternal`) get classified data only through their role's data access (the seeded Vendor role grants none), never the system administrator role. SAD sections: per-section permissions decide, vendors included.
- [ ] Response schemas list fields explicitly; nothing is serialised straight from an entity.
- [ ] Request bodies are `.strict()` Zod schemas (no mass assignment of `status`, `ownerId`, `createdBy`, etc.).
- [ ] Approval actions verify the actor is the task assignee (or holds `approvals:task:reassign` for reassign).
- [ ] Admin-only functions (roles, rules, reassign, audit read) require their specific permission.

## Authentication and sessions (API2)
- [ ] API keys: random ≥ 256 bits, stored as SHA-256 hash only, compared in constant time, expiry enforced, revocation immediate, last-used recorded.
- [ ] API keys cannot create other API keys.
- [ ] Disabled users are rejected even with a valid key or session.
- [ ] SAML (`SamlService.completeLogin` keeps every check; node-saml skips issuer, Destination and Recipient): signature on response and assertion verified, audience and recipient checked, InResponseTo and replay protected, clock skew bounded, only added users sign in; session cookies httpOnly, Secure, SameSite; short-lived access token + rotating refresh token; cookie-authenticated state changes need an allowed `Origin`.

## Input, output and injection (API8)
- [ ] No string-built SQL with user input; parameters only. Identifiers go through `quoteIdent` and an allowlist.
- [ ] No `eval`, `new Function`, dynamic `require/import` of user-controlled paths.
- [ ] Outbound HTTP calls (SSRF, API7) only to configured hosts.
- [ ] Rate limiting active (`@nestjs/throttler`); request body size limited (API4).

## Files
- [ ] Upload type checked by content (magic bytes), not only extension; size ≤ 25 MB; SVG and ZIP rejected.
- [ ] Stored under generated names; never served from a user-supplied path; downloads require permission and scope.
- [ ] Deployed storage: blobs private, malware scan result checked before release.

## Data protection
- [ ] No secrets, tokens, passwords or personal data in logs or audit metadata.
- [ ] TLS to the database in deployed environments (`DB_SSL=true`).
- [ ] Financial tables have row-level security as a second line of defence.

## Configuration and errors (API8, API9)
- [ ] Errors are RFC 9457 problem+json without stack traces or SQL in production.
- [ ] Helmet headers on; CORS restricted to `FRONTEND_ORIGINS`.
- [ ] Swagger UI requires login and `system:api-docs:read`.
- [ ] Environment validated at start-up; the app refuses to start with invalid config.

## Logging and audit
- [ ] Every authenticated request (views included) produces an audit row; changes record before/after.
- [ ] Audit table is append-only (update/delete blocked by trigger).
- [ ] Authentication failures and permission denials are recorded.

## Frontend
- [ ] No `dangerouslySetInnerHTML` with user content; no tokens in localStorage.
- [ ] All API calls go through `api(path, { schema })` (`src/lib/api.ts`) with a Zod response schema; no secrets in the bundle (`VITE_*` vars are public).
