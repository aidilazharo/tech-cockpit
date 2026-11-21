# Database Access Library (ORM) for the NestJS Backend

Research date: 2026-10-21. Versions checked on npm the same day.

## Recommendation

**MikroORM 7**, confirmed by a half-day spike before committing (see "Spike" below). Runner-up: **Drizzle ORM**.

Why MikroORM 7 fits TechCockpit:

- **Stable major that just shipped.** v7 went stable in 2026 and is on 7.2.5, with patch releases every few days. No breaking major is pending.
- **Official NestJS 12 support.** `@mikro-orm/nestjs` 7.1.0 declares `@nestjs/core ^11 || ^12`.
- **Request-scoped unit of work.** Each HTTP request gets its own entity manager. That suits per-request audit logging ("all views") and per-request database settings for row-level security.
- **Strict TypeScript**, migrations with up/down, seeding, and a schema-diff generator.
- **MIT licence.**

Main risk: a **small maintainer team, led by one person**. Mitigation: repositories and services depend on our own interfaces, so a later switch stays contained.

## Requirements the library must meet

| Requirement                                                    | Why                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| PostgreSQL **15** (Azure Flexible 15.19, Docker `postgres:15`) | Matches the Azure server                                 |
| **Schema per developer** via `DB_SCHEMA` (`search_path`)       | Shared dev database on the company laptop                |
| Migrations that **don't hard-code a schema name**              | Same migration files for every developer and environment |
| Works with **row-level security** (RLS) for financial tables   | Defence in depth beyond app-level RBAC                   |
| NestJS 12, ES modules, Node 26, Windows                        | Existing scaffold and machine                            |
| Actively maintained, latest **stable** version                 | Your library policy                                      |

## Candidates compared

|                          | MikroORM 7                                              | Drizzle                                                                                      | Prisma                                                                                                       | TypeORM                                                   | Kysely                 |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------- |
| Latest stable            | 7.2.5 (MIT)                                             | 0.45.4 (Apache-2.0)                                                                          | Client 7.10.1 (Apache-2.0)                                                                                   | 1.1.2 (MIT)                                               | 0.29.7 (MIT)           |
| Pending breaking upgrade | None known                                              | **1.0 in RC since mid-2026**, with a drizzle-kit rewrite ("something will definitely break") | **CLI `latest` tag points to `8.0.0-rc.24`** while the client is 7.10.1                                      | Just reached 1.x                                          | Still 0.x              |
| NestJS 12 module         | Official                                                | None needed (plain provider)                                                                 | None needed (plain provider)                                                                                 | Official `@nestjs/typeorm` 12                             | None needed            |
| Schema per developer     | Via connection `search_path` (verify in spike)          | Via connection `search_path`                                                                 | **Known issue**: the pg adapter ignored the schema setting in 7.0; workaround sets `search_path` on the pool | `schema` option; generated migrations may qualify names   | Fully manual; easy     |
| RLS support              | Manual SQL in migrations + per-transaction `set_config` | **First-class** `pgPolicy` in table definitions                                              | None built in                                                                                                | None built in                                             | Manual                 |
| Query style              | Entities + unit of work                                 | SQL-like TypeScript                                                                          | Generated client                                                                                             | Entities / active record                                  | Typed SQL builder      |
| Main risk                | Maintainer bus factor                                   | 1.0 migration cost                                                                           | Release churn, adapter issues                                                                                | Weaker query typing; `synchronize: true` can drop columns | More hand-written code |

Not recommended now:

- **Prisma**: a plain `npm install prisma` today installs a **release candidate**, which breaks your "latest stable only" rule. The `search_path` problem in the pg adapter also hits the schema-per-developer setup directly.
- **Drizzle**: best-in-class RLS support, but starting on 0.45 means a known breaking migration to 1.0 soon after. Choose it if you prefer SQL-first code and accept that upgrade.

## How row-level security fits (any library)

App-level RBAC (NestJS guards plus a policy service) stays the primary control. RLS is a second line on the most sensitive tables (financials, contract terms, staff personal data):

1. Each request opens a transaction and runs `select set_config('app.user_id', $1, true)` (plus role and scope IDs).
2. RLS policies on financial tables read `current_setting('app.user_id')` and allow only permitted rows.
3. The application connects as a **non-owner database role**, so policies always apply.

## Spike (half a day, before committing)

Run on a local Docker `postgres:15` and the shared Azure dev database:

1. Two schemas, `tc_spike_a` and `tc_spike_b`, set through `DB_SCHEMA`.
2. Generate one migration; confirm the SQL has **no schema name** and applies cleanly to both schemas.
3. One table with an RLS policy driven by `set_config`; prove a second user can't read the first user's rows (positive and negative Vitest tests).
4. Run on Node 26 with ES modules and Vitest, on Windows Git Bash.

If MikroORM fails any step, repeat the spike with Drizzle 0.45.

## Open decision for you

- Accept **MikroORM 7 (with spike)**, or prefer **Drizzle** for SQL-first code and native RLS, accepting a 1.0 upgrade later?

## Sources

- [MikroORM 7 release announcement](https://mikro-orm.io/blog/mikro-orm-7-released) and [releases](https://github.com/mikro-orm/mikro-orm/releases)
- [@mikro-orm/nestjs on npm](https://www.npmjs.com/package/@mikro-orm/nestjs)
- [Drizzle v1.0.0-beta.2 release notes](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v1beta2), [v0 → v1 changes](https://orm.drizzle.team/docs/v0-v1-changes), [Drizzle RLS docs](https://orm.drizzle.team/docs/rls), [v1 roadmap](https://orm.drizzle.team/roadmap)
- [Prisma 7 overview](https://www.prisma.io/docs/orm/v7), [Upgrade to Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [PrismaPg schema issue #28611](https://github.com/prisma/prisma/issues/28611)
- [Encore — Comparing TypeScript ORMs (2026)](https://encore.dev/articles/typescript-orms)
- [ZenStack — Prisma vs Drizzle (2026)](https://zenstack.dev/blog/orm-2026)
- [PkgPulse — State of Node.js ORMs 2026](https://www.pkgpulse.com/guides/state-of-nodejs-orms-2026)
- [Strapi — Top ORMs 2026](https://strapi.io/blog/orms-for-developers)
- npm registry metadata and dist-tags (queried 2026-10-21).
