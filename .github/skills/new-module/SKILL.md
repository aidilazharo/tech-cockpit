---
name: new-module
description: Adds a new TechCockpit business module end to end (PostgreSQL tables, MikroORM entities, migration, service, REST API with OpenAPI docs, RBAC permissions, data classification, approval workflow hook, audit, React screens, unit and e2e tests) in test-first order. Use when the user asks to add a module, entity, CRUD feature, table, register, or new screen backed by data.
argument-hint: <module-name>
---

# Add a module

The module name is what the user gave after `/new-module` (ask for it if missing). Build in this exact order. Each phase starts with a failing test (see the `tdd-cycle` skill). Do not skip phases; a module is not done until every box is ticked.

```
Module progress:
- [ ] 1. Spec agreed with the user (docs/modules/<module>.md)
- [ ] 2. Data classification of every field
- [ ] 3. Permissions declared
- [ ] 4. Entities + migration (db-migration skill)
- [ ] 5. Zod schemas (request/response) + OpenAPI (api-contract skill)
- [ ] 6. Domain logic + service, unit tests first
- [ ] 7. Controller + e2e tests (positive AND negative)
- [ ] 8. Approval workflow registered (only if the record is approvable; rbac-approvals skill)
- [ ] 9. Audit: changes recorded with before/after
- [ ] 10. Frontend screens (ui-screen skill) + Playwright e2e (e2e-tests skill)
- [ ] 11. Coverage >= 99%, lint, typecheck, db check all green
```

## 1. Spec first

Ask the user for anything not already in `docs/requirements-decisions.md`. Never guess fields, statuses or who may see what. Write `docs/modules/<module>.md`: purpose, fields (name, type, required, classification), statuses and transitions, who can create/read/update/delete, whether it is approvable, list filters, and open questions. Get the user's confirmation before coding.

## 2. Classify every field

Each response field gets exactly one class (see `rbac-approvals` skill, reference/rbac.md):

| Class       | Examples                         | Who sees it                                                |
| ----------- | -------------------------------- | ---------------------------------------------------------- |
| `internal`  | names, statuses, dates           | anyone with the read permission                            |
| `financial` | costs, budgets, actuals, TCO     | role visibility + approver rule (seeded Vendor role: none) |
| `contract`  | contract terms, rates, penalties | role visibility (seeded Vendor role: none)                 |
| `personal`  | staff personal data (PDPA)       | role visibility (seeded Vendor role: none)                 |

Register every classified (non-`internal`) structured field in `FieldClassRegistry` (`<module>.<record>.<field>`, label, default class) from the module's constructor, and mask with `FieldClassService.classes(em).viewer(principal, { scope })`: administrators can reclassify fields without a release. Return the masked field names in a `restricted` list so the web app shows "Restricted".

## 3. Permissions

Add `src/modules/<module>/<module>.permissions.ts` using `definePermissions` and register it in `src/modules/access/permission-catalogue.ts`. Naming: `<module>:<resource>:<action>`, actions `read | create | update | delete | manage | approve | export`. Grant defaults to seeded roles only with the user's agreement.

## 4–9. Backend

Follow [reference/backend.md](./reference/backend.md) for the folder layout, entity, service, controller and test templates. Follow [reference/database.md](./reference/database.md) for table rules.

## 10. Frontend

Use the `ui-screen` skill. In `ReactTS_Frontend/src/features/<module>/`:

- `schemas.ts`: Zod schemas for every response and request the screens use, plus `contract.test.ts` checking them against `openapi.json` (copy `features/admin/contract.test.ts`).
- `queries.ts`: TanStack Query hooks calling `api(path, { schema })`; mutations invalidate the affected keys.
- Pages registered in `src/routes.tsx` with `guarded('<permission>', () => import(...))` (lazy, permission-checked), and an entry in `src/app-shell/nav-items.ts` with the same permission.
- Tests with `src/test/harness.tsx` (`mockApi`, `signInWith`, `renderRoute`): positive path, a user lacking the permission, API refusals (403/409) and load failure with retry.

## 11. Definition of done

Run `node scripts/run-full-suite.mjs` (all 11 steps: backend and frontend lint, types, build, `db -- check`, unit, integration, API e2e and Playwright, with the 99% gates), and `node scripts/run-full-suite.mjs --check-tests`: every test file of the module must be one the suite runs. All green, coverage >= 99%. Then run the `code-review` skill, and finish with the `commit` skill (micro commits, full suite, test report).
