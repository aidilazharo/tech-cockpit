---
name: db-migration
description: Creates and applies TechCockpit PostgreSQL migrations with MikroORM 7 safely — schema-agnostic SQL, per-developer schemas (DB_SCHEMA) on the shared Azure PostgreSQL, row-level security, and data-loss guards. Use when changing entities, tables, columns, indexes, constraints, RLS policies, or running migrations.
---

# Database migrations

Follow these steps exactly. Do not improvise commands.

```
Migration progress:
- [ ] 1. Entity changed (wildcard schema, baseProperties) and listed in src/database/entities.ts
- [ ] 2. npm run db -- create <kebab-name>
- [ ] 3. Reviewed the generated SQL
- [ ] 4. Hand-added RLS / data steps if needed
- [ ] 5. npm run db -- migrate
- [ ] 6. npm run db -- check && npm run test:int
```

All commands run in `NestJS_Backend`.

## Environment

The Windows company laptop uses the shared Azure PostgreSQL Flexible Server 15.19 with `DB_SSL=true`; there is no Docker.

Each developer works in their own schema (`DB_SCHEMA=tc_<name>`); tests use `<DB_SCHEMA>_test`, which is dropped and recreated on every integration/e2e run.

## Step 3: review the generated SQL

- No schema names. `create` already rejects files containing `schema.table`; never hand-write one.
- **Destructive statements** (`drop column`, `drop table`, `alter column ... type`, renames that drop data): stop and ask the user. Prefer expand → migrate data → contract across separate releases.
- New NOT NULL column on an existing table: needs a default or a data backfill step.
- Large tables: create indexes with care; mention lock impact to the user.

## Step 4: hand additions

Allowed inside the generated file's `up()` (and reversed in `down()`):

- RLS: `enable` + `force row level security` + `create policy` for financial/contract/personal tables.
- Seed reference data that the user has supplied (roles, categories).
- Triggers (e.g. append-only audit).

After hand edits, `npm run db -- check` must still say the entities match the snapshot.

## Never

- Edit or delete a migration already applied in a shared environment (SIT/UAT/prod or the shared Azure dev DB used by others).
- Point tests at a non-`_test` schema.

## Deployment

The DevSecOps pipeline runs `node dist/database/cli/db.js migrate` with the migration login before starting the new app version. The app itself connects with the app login (no DDL rights).
