# AIA TechCockpit

Enterprise technology one-stop centre for AIA: Technology Reference Model (TRM) with System Architecture Design (SAD) documents and ServiceNow sync, PMO investment and outcome tracking with a unified approval centre, a Tech Control Tower for executives, and vendor management.

> Status: foundation built (Okta SAML sign-in, access control, approval engine, audit, API keys, Qi design system). TRM part 1 built: ServiceNow exports loaded with `npm run trm:sync` (in NestJS_Backend), browse pages and TRM assessment. Landscape views come next.

## Repository

| Folder                               | Contents                                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [NestJS_Backend](NestJS_Backend)     | REST API (NestJS 12, MikroORM 7, PostgreSQL 15)                                                                                                                                                 |
| [ReactTS_Frontend](ReactTS_Frontend) | Web app (React 19, Tailwind 4, AIA Qi components)                                                                                                                                               |
| [docs](docs)                         | [Decisions](docs/requirements-decisions.md), [research](docs/research), module specs                                                                                                            |
| [.claude/skills](.claude/skills)     | Default coding agent (Claude Code): skills that encode how this project is built; rules in [CLAUDE.md](CLAUDE.md), [NestJS_Backend/CLAUDE.md](NestJS_Backend/CLAUDE.md) and [ReactTS_Frontend/CLAUDE.md](ReactTS_Frontend/CLAUDE.md) |
| [.github/skills](.github/skills)     | Fallback coding agent (GitHub Copilot, local, when Claude is not available): the same skills; rules in [.github/copilot-instructions.md](.github/copilot-instructions.md) and [.github/instructions](.github/instructions) |

## Getting started

For standard multi-application development, isolated mock preview, and ATGV Custom Stack
integration, see [Local development and ATGV compatibility](docs/guides/local-development-atgv.md).


Prerequisites: Node.js 24 or newer (production runs 24 LTS), npm 11.

### Backend

```bash
cd NestJS_Backend
cp .env.example .env          # then fill in the values (see below); SESSION_JWT_SECRET and SAML_IDP_METADATA_URL included
npm ci
```

No Docker: point `.env` at the shared Azure PostgreSQL dev server, set `DB_SSL=true` and your own `DB_SCHEMA=tc_<name>`.

```bash
npm run db -- migrate          # creates your schema's tables (and seeds roles)
npm run bootstrap:admin -- --username <your Okta username> --email <your email> --first-name You --last-name Name
npm run start:dev              # http://localhost:3000/api/v1/health
```

The bootstrap command makes you a system administrator and prints a personal API key once (`Authorization: Bearer <key>`, for scripts and the ServiceNow CLI). In the browser you sign in with Okta. Swagger UI is at `/api/docs` and needs `system:api-docs:read`. Okta setup: [docs/guides/okta-test-tenant-setup.md](docs/guides/okta-test-tenant-setup.md).

### Frontend

```bash
cd ReactTS_Frontend
npm ci
npm run dev                    # http://localhost:5173 -> Sign in with Okta; component gallery at /design-system
```

## Quality gates

Both projects: `npm run lint`, `npm run typecheck`, `npm run test:cov` (≥ 95% coverage), plus `npm run test:e2e`. The frontend's `npm run test:e2e:okta` signs in through the real Okta dev tenant (needs `ReactTS_Frontend/.env.e2e.local`). The backend also runs `npm run db -- check` (entities match migrations) and keeps `openapi.json` current.
