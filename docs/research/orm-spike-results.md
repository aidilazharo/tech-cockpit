# MikroORM 7 Spike — Results

Date: 2026-10-21. Machine: Docker `postgres:15.19` (same version as Azure). Node 26.3, MikroORM 7.2.5.

**Verdict: MikroORM 7 adopted.** Every requirement from [orm.md](orm.md) passed once three integration details (below) were handled. The proof is a permanent integration test suite, [test/integration/database.int-spec.ts](../../NestJS_Backend/test/integration/database.int-spec.ts), which re-runs on every `npm run test:int`.

## What was proven

| Requirement                                                  | Result | How                                                                                                                                                                                  |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migrations contain no schema name                            | ✅     | Entities use wildcard schema `'*'`; generation runs with no schema set. `npm run db -- create` also scans the generated SQL and deletes the file if any `schema.table` name appears. |
| Same migration files apply to any developer's schema         | ✅     | Test applies them to `tc_terry_test` and `tc_terry_alt_test` and compares the resulting tables.                                                                                      |
| Incremental changes generate only the delta                  | ✅     | Adding a column generated a single unqualified `alter table "department" add ...` with its `down`.                                                                                   |
| Missing migrations are detected                              | ✅     | `npm run db -- check` exits 1 when entities differ from the snapshot (for CI).                                                                                                       |
| App login cannot change the schema                           | ✅     | `create table` as the app login → permission denied.                                                                                                                                 |
| App login cannot read migration history                      | ✅     | Revoked after each migrate.                                                                                                                                                          |
| Row-level security by user                                   | ✅     | Each user sees only their own rows; no context → no rows.                                                                                                                            |
| No user context leaks between requests on pooled connections | ✅     | `set_config(..., true)` is transaction-local; verified over repeated pooled queries.                                                                                                 |
| RLS blocks writing rows for someone else                     | ✅     | Forged insert rejected by the policy.                                                                                                                                                |
| Runs on Node 26 ESM with Vitest                              | ✅     |                                                                                                                                                                                      |

## Three integration details we handle in code

1. **Snapshot omitted wildcard tables (MikroORM 7.2.5 behaviour).** `migration:create` stored the snapshot without wildcard-schema tables but diffed with them, so every `create` regenerated all tables. Fixed by a small `Migrator` subclass ([techcockpit-migrator.ts](../../NestJS_Backend/src/database/techcockpit-migrator.ts)) that stores and compares snapshots with wildcard tables included. It must keep the class name `Migrator`, otherwise MikroORM silently registers its own. Worth reporting upstream.
2. **Raw SQL ignores MikroORM's `schema` option.** ORM queries were qualified correctly, but raw SQL (and anything RLS policies reference) used the default `public` search path. Fixed by setting `search_path` to `DB_SCHEMA` on every pooled connection (`-c search_path=...` startup option). `public` is not on the path at all.
3. **`checkSchema()` returns `true` when changes are pending**, not when the schema matches. Our `check` command uses the subclass method `hasPendingEntityChanges()` instead.

## Still to verify on the Windows company laptop

Run once against the shared Azure dev database (no Docker):

```bash
# in NestJS_Backend, with .env pointing at Azure (DB_SSL=true, your own DB_SCHEMA)
npm run db -- prepare
npm run test:int
```

Things that can differ on Azure:

- Whether your login may `CREATE SCHEMA`. If not, ask the DBA to create `tc_<you>` and `tc_<you>_test`, owned by your migration login.
- Whether a separate app login exists. If you only have one login, RLS still applies because protected tables use `FORCE ROW LEVEL SECURITY`, but the "app login cannot create tables" protection is lost locally. Deployed environments must use two logins.
- The `-c search_path` startup option must be accepted. It is for direct connections to Flexible Server, but not through PgBouncer in transaction mode.
