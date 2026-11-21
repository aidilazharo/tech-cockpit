---
name: servicenow-sync
description: How TechCockpit loads ServiceNow exports into the TRM — the trm:sync CLI, staged sync runs (start, batches, complete, abandon), dry runs, sys_id and name matching, the plan applied in one transaction, records flagged missing and their deliberate removal, field classes of synced fields. Use when changing or debugging the ServiceNow sync, sync runs, the export mapping, missing records, or adding a ServiceNow field or export to TRM.
---

# ServiceNow → TRM sync

The product owner's Node export application writes one JSON file per ServiceNow table (samples, structure only, in `apm/`; values there are synthetic). A system admin loads them with a CLI that calls the sync API with a personal API key. Decisions: `docs/requirements-decisions.md` §2; spec: `docs/modules/trm.md`.

## Flow

1. CLI (`NestJS_Backend/src/scripts/trm-sync.ts` → `src/modules/trm/cli/trm-sync-client.ts`). The key comes from the environment, never the command line:
   ```
   set TECHCOCKPIT_API_KEY=<personal API key>      (Git Bash: export ...)
   npm run trm:sync -- --dir <folder> [--api <url>] [--dry-run]
   ```
   `--api` defaults to `TECHCOCKPIT_API_URL`, else `http://localhost:3000`.
2. API (`trm.controllers.ts`, all `trm:sync:run`, system admins): `POST /api/v1/trm/sync-runs` `{ dryRun }` → `PUT .../{id}/records` `{ file, records }` per batch (CLI limit 500 rows and 900,000 bytes) → `POST .../{id}/complete` `{ expected }` (row counts per file), or `POST .../{id}/abandon`. Runs are listed and read with GET on the same path (web: `SyncRunsPage`, `SyncRunPage`).
3. `TrmSyncService` (`trm-sync.service.ts`) holds batches per run, then on complete builds the plan with the pure `planSync` (`domain/sync-plan.ts`) and applies it in **one transaction**. A dry run only reports. Audit: `trm.sync.completed` or `trm.sync.dry-run`. A run idle for `STALE_SYNC_RUN_MS` (2 h) no longer blocks a new one.

## Exports and matching

`domain/sync-files.ts` (`SYNC_FILES`): `business_application`, `mapped_application_service`, `business_service`, `business_capability`, `product_standard`, `ba_as_sm`, `ba_as_bs`, `ba_as_server`.

| Rule                                                                                                                                                                                                                                                    | Where                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Records match on `sys_id`; a row without one is skipped; a later duplicate wins                                                                                                                                                                         | `planSync` (`bySysId`)                 |
| Unchanged rows are detected by a SHA-256 `contentHash` of the row; changed → update, unknown → insert                                                                                                                                                   | `domain/values.ts`, `planSync`         |
| Each record keeps every delivered field (source JSON) plus key columns for search, filters and access                                                                                                                                                   | `domain/mapping.ts`, `trm.entities.ts` |
| Service kind comes from `sys_class_name`; application-service classes default to `APPLICATION_SERVICE_CLASSES`, overridable with `TRM_APPLICATION_SERVICE_CLASSES`                                                                                      | `domain/mapping.ts`                    |
| Path files `ba_as_bs` and `ba_as_server` match **by name**; servers are known by name only. A name that matches no record or several is reported (`not-found` / `ambiguous`) and skipped                                                                | `domain/name-index.ts`, `planSync`     |
| A software model names its product standard (`sm_u_product_standard`), matched by name                                                                                                                                                                  | `planSync`                             |
| Capability tree (3 levels) is built from parent names; problems (parent not found or ambiguous, duplicate name, cycle, too deep) are reported. An application whose group/family/category fields do not follow the tree is flagged `capabilityMismatch` | `domain/capabilities.ts`               |

## Missing records and removal

- Every export is a **complete** export of its table. When an export is included, records of that type not in it get `missingSince`; a record that comes back has the flag cleared. An export not sent in the run is "not included": nothing of that type is flagged and its links are kept.
- **The sync never deletes.** Removal is a separate admin action (`trm-removal.service.ts`, `/api/v1/trm/missing-records`, `trm:synced-record:delete` with a company-wide grant; web `MissingRecordsPage`, `/admin/trm-missing`). Only flagged records can go; refused while in use (application: SAD not cancelled, running approval, roadmap action; capability: roadmap initiative or sub-capabilities still in ServiceNow) or while a run is receiving. A removed record that returns later comes back as a new record.
- ServiceNow-sourced fields are read-only in TRM; TRM-only fields are never touched by the sync.

## Data protection

Mapped cost columns are `financial` and people columns `personal` (`trm-fields.ts`, registered in `FieldClassRegistry`; admins can reclassify). Raw source fields are classified by name so new ServiceNow fields are protected without a release: anything about cost is financial, anything naming a person (owner, manager, lead, contact, `*_by`) is personal (`domain/source-fields.ts`). Who sees which applications: `trm-visibility.ts`. See the `rbac-approvals` skill.

## Changing the sync

Ask the user before changing matching, missing-record or removal rules; they are product decisions in §2. Then, test first (`tdd-cycle`):

- **New field from an existing export**: map it in `domain/mapping.ts` (column only if it is searched, filtered or used for access; otherwise it is already in the source JSON); entity column + migration (`db-migration` skill); output schema in `trm.schemas.ts`, `npm run openapi`, and the web app's `features/trm` schemas and contract test (`api-contract` skill); register it in `trm-fields.ts` if it is financial, contract or personal.
- **New export file**: add it to `SYNC_FILES`, then mapping, plan input/output in `sync-plan.ts`, the service's snapshot and apply, the report (`domain/sync-report.ts`), entities + migration, schemas and pages; decide with the user whether it can be removed when missing (`trm-removal.service.ts`).

Tests: `domain/*.spec.ts` (plan, mapping, values, names, capabilities, report, source fields), `cli/trm-sync-client.spec.ts`, API e2e `test/e2e/trm-sync.e2e-spec.ts` and `trm-removal.e2e-spec.ts` (fixtures `test/e2e/support/trm-fixtures.ts`), web `features/trm/missing.test.tsx`. Never put real ServiceNow data (names, people, sys_ids, hosts) in tests or docs.
