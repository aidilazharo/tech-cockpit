# TRM module spec: part 1 (data, sync, browse, TRM-only fields)

Status: **confirmed by the product owner, 2026-10-22; built 2026-10-22.** Decisions come from [requirements-decisions.md §2](../requirements-decisions.md); the data structure from [research/servicenow-samples.md](../research/servicenow-samples.md). Items marked **(to confirm)** are proposals; the open questions are at the end.

## Purpose

TechCockpit keeps a read-only copy of ServiceNow APM data, refreshed when a system admin loads an export, and adds TRM-only fields that architects and owners maintain. Part 1 covers the data model, the sync, browsing every record type and editing the TRM-only fields. Landscape views (capability map, domain, lifecycle, technology layer) are part 3.

## Record types

| Record | From | Key | Notes |
|---|---|---|---|
| Business application | `business_application.json` | `sys_id` | TRM-only fields added |
| Service | `mapped_application_service.json`, `business_service.json` | `sys_id` | One table; **kind** from `sys_class_name` using the standard ServiceNow classes: application service = `cmdb_ci_service_auto` and its children (`cmdb_ci_service_discovered`, `cmdb_ci_service_by_tags`, `cmdb_ci_query_based_service`, `cmdb_ci_service_calculated`); business service = `cmdb_ci_service_business` or `cmdb_ci_service`. Kept as a setting so it can change without a release |
| Business capability | `business_capability.json` | `sys_id` | 3-level tree from `parent` (by name); empty parent = top level |
| Server | `ba_as_server.json` (`u_server_1`) | name | **Name only** for now |
| Software model | `ba_as_sm.json` (`sm_*`) | `sys_id` | Links to its product standard by name (`u_product_standard`) |
| Product standard | `product_standard.json` | `sys_id` | Standard / Restricted |

| Link | From | Matched by |
|---|---|---|
| Application → service (application service) | `ba_as_sm.json` (`rel_*`), `ba_as_bs.json`, `ba_as_server.json` | sys_id in `ba_as_sm`; **names** in the path files |
| Application service → business service | `ba_as_bs.json` | names |
| Application service → server | `ba_as_server.json` | names |
| Application service → software model | `ba_as_sm.json` (`sw_*`, with `full_version`, `primary_model`) | sys_id |
| Application → capability | application's 3 capability fields | names; the application belongs to its **lowest** filled capability. If a field's parent chain disagrees, the application is flagged |
| Software model → product standard | software model's `u_product_standard` | name |

Every ServiceNow record keeps **all fields as delivered**, plus the key fields below as columns. Each record also carries sync metadata: the last sync run that saw it, `missing since` (set only by a complete run that no longer finds it), the ServiceNow updated date, and a content hash so unchanged records are not rewritten.

## Key fields and classification

Classes: `internal` (anyone who can view TRM), `financial` (role financial access; never vendors), `personal` (role personal access; never vendors). *(Superseded 2026-10-22: roles decide for vendors too; see [rbac-configurable.md](rbac-configurable.md).)* Administrators can reclassify the structured fields (field classification).

**Business application**

| Field | ServiceNow field | Type | Class |
|---|---|---|---|
| Number, name, display name, short name, description | `number`, `name`, `u_display_name`, `u_short_name`, `short_description` | text | internal |
| Install status, operational status, record status | `install_status`, `operational_status`, `u_ba_record_status` | text | internal |
| Install type, group or local | `install_type`, `u_group_or_local` | text | internal |
| Business unit, owned business unit, serving business units | `business_unit`, `u_owned_business_unit`, `u_serving_business_units` | text / list | internal |
| Criticality rating, BCM criticality | `u_application_criticality_rating`, `u_application_bcm_criticality` | text | internal |
| RTO, RPO, recovery time capability | `u_business_application_rto`, `u_business_application_rpo`, `u_recovery_time_capability` | text; time `hh:mm` | internal |
| Capability group, family, category (names) + resolved capability | `u_capability_category_group`, `u_capability_family`, `u_capability_category` | text + link | internal |
| IT application owner, application lead, application manager | `it_application_owner`, `u_application_lead`, `u_application_manager` | text | **personal** |
| Annual costs (k USD): licence, internal support, external support, infra on-premises, infra cloud | `u_annual_license_cost_k_usd`, `u_annual_internal_support_cost_k_usd`, `u_annual_external_support_cost_k_usd`, `u_annual_infra_cost_on_premises_k_usd`, `u_annual_infra_cost_cloud_k_usd` | decimal | **financial** |
| ServiceNow last updated | `sys_updated_on` | date-time | internal |

**TRM-only fields (business application)**: never touched by the sync, no approval, audited.

| Field | Type | Who sets it |
|---|---|---|
| Portfolios | **none, one or several** portfolios per application, from a minimal portfolio list (name, active) built now; PMO extends it later | system admins |
| TIME rating | Tolerate / Invest / Migrate / Eliminate, optional, with an **optional rationale** (up to 2,000 characters) | editors (below) |
| Functional fit, technical fit | **1–5**: 1 Very poor · 2 Poor · 3 Fair · 4 Good · 5 Excellent | editors |
| Lifecycle plan dates | **planned go-live, planned phase-out, planned retirement, vendor end of support** (each optional) | editors |

**Service**: kind, number, name, display name, description, operational status, environment, used for, service classification, portfolio status, business criticality, data classification, customer PII / credit card / healthcare / price-sensitive data flags, network facing, RTO, RPO, application security rating, hosting provider (all internal); owned by (**personal**).

**Business capability**: name, parent, level (1–3, from the tree), leaf, description, status (internal).

**Software model**: name, product, version, manufacturer, product type, model category, product standard (internal).

**Product standard**: product standard, product, manufacturer, **status (Standard / Restricted)**, standard category, functional category, cloud service type, VM and container flags (on-premises / cloud), allowed on desktop, AI features and controls, remarks, last status date, added date, assessment link (internal).

**Server**: name (internal).

ServiceNow's own audit fields (`sys_created_by`, `sys_updated_by`) hold user IDs, so they are **personal**.

## Who can do what

| Action | Who | Permission (proposed) | Scope |
|---|---|---|---|
| View TRM (all record types) | roles granted it by admins | `trm:application:read` | global; **application** for vendors and owner teams |
| Edit TRM-only fields | enterprise architects, solution architects | `trm:application:update` | global |
| | application owner team | `trm:application:update` | application |
| | portfolio leads | `trm:application:update` | portfolio (any of the application's TRM portfolios) |
| Maintain the portfolio list | system admins | `portfolio:portfolio:manage` (no seeded role) | global |
| Set applications' portfolios | system admins | `trm:application-portfolio:manage` (no seeded role) | global |
| Load a ServiceNow export | system admins only | `trm:sync:run` | global |

- Vendors with an application-scoped role see those applications and, linked to them, their services, servers, software models, product standards and capabilities (confirmed 2026-10-22). They never see costs, people's names, ServiceNow audit fields or the all-fields panel.
- Every view and change is audited. TRM-only changes record before and after.
- Seeded role defaults (confirmed 2026-10-22):
  - **view TRM**: enterprise architect, solution architect, ARB member, ARB chair, portfolio lead, product manager, PMO, Tech EXCO, Finance EXCO;
  - **edit TRM-only fields**: enterprise architect and solution architect (global), portfolio lead (within their portfolio assignments);
  - a new seeded role, **Application owner team**: view TRM and edit TRM-only fields, assigned per application, with no cost access by default;
  - a new seeded role, **TRM viewer**: view TRM only. No editing and no cost access; people's names on the records it covers. Admins assign it company-wide alongside a scoped role (confirmed 2026-10-22).

  - **people's names** (personal data): the seeded TRM roles get personal-data access at level `scope` (confirmed). With a global assignment that means every record; with a portfolio or application assignment, only those records. Vendors never see names.

  Admins can change all of this later.
- **How scopes apply**: a role's scope comes from each assignment and covers all of that role's permissions. So a portfolio lead assigned to a portfolio views **and** edits only that portfolio's applications (any of an application's portfolios counts). To browse all of TRM as well, they get a **second, global assignment of a viewing role** (confirmed 2026-10-22). The same applies to application owner teams.

## Sync

1. A system admin runs the TechCockpit CLI on the Node app's output folder: `node tools/trm-sync/sync.mjs --dir <folder> [--dry-run]`. The API key comes from an environment variable, never a command-line argument, so it never lands in shell history.
2. The CLI starts a sync run, sends each file's records in batches (`PUT /api/v1/trm/sync-runs/{id}/records`), then completes the run.
3. The server upserts by sys_id (servers by name) and never deletes. Only changed content is written. Removal is a separate, deliberate admin action (see [Removing missing records](#removing-missing-records)).
4. When a run completes, links are rebuilt from the path files and the joined view, and capability chains are checked.
5. **Missing records** are flagged when a run completes: every Node-app file is a complete export of its table (confirmed 2026-10-22). A failed or unfinished run flags nothing.
6. The report shows inserted, updated, unchanged and newly missing counts per record type. It also lists names that **did not match** or **matched more than one record**, with the file; those links are **not created** (confirmed 2026-10-22).

## Removing missing records

The sync only flags records the last complete export no longer contained (`missingSince`). A system admin can remove them on purpose (requested by Terry, built 2026-10-28).

- **Screen:** Administration → *Records missing from ServiceNow* (`/admin/trm-missing`). One record type at a time (applications, services, capabilities, product standards, software models, servers), with counts, a name/number search, 25 per page, and a "Can it be removed?" column that lists what stops each record. Tick records (or "select all removable on this page"), choose *Remove selected*, confirm. Records that were refused are listed afterwards with the reason.
- **Permission:** `trm:synced-record:delete`, held by system admins only (no seeded role has it). It must be granted **company-wide**; a department-scoped grant gets 403, because removal reaches every record. The list and counts need the same permission.
- **API:** `GET /api/v1/trm/missing-records/summary`, `GET /api/v1/trm/missing-records?recordType=&q=&page=&pageSize=`, `POST /api/v1/trm/missing-records/delete` with `{ recordType, ids }` (1 to 100 ids; partial success: `{ deleted, refused: [{ id, reason }] }`).
- **Only flagged records:** a record that is back in the export is refused (`not-missing`); an id that no longer exists is `not-found`.
- **Records in use are refused (blockers):**
  - application with a SAD version that is not cancelled (`has-sad-history`);
  - application with an approval still running: in progress, returned or awaiting information (`open-approval`);
  - application named by an EA roadmap action, as the application or its replacement, or capability linked to an initiative (`used-by-initiative`);
  - capability with sub-capabilities that are still in ServiceNow (`has-children`).
- **Not while a sync run is receiving data:** 409 until the run is completed or abandoned (a run idle for over the stale limit does not count).
- **What goes with a record:** its links to other records and its TRM-only data (assessment, portfolios, domains) are deleted with it. Finished approvals stay (they hold the application id without a foreign key). Every removed record is written to the audit log (`trm.record.deleted`) with its type, number, name, ServiceNow id and flagged date.
- **Coming back:** a later export that contains the removed record inserts it as a **new** record (new id); nothing added in TechCockpit survives.
- **Servers** are known by name only, so they have no ServiceNow id column.

## Screens (part 1)

- **Applications**: list with search and filters (install status, criticality, business unit, capability, TIME rating, portfolio, missing from ServiceNow). Detail page sections:
  - ServiceNow fields, read-only;
  - TRM fields, editable by editors;
  - capability path;
  - services by environment, with their servers and software models;
  - software models with product standard status;
  - **all ServiceNow fields**, for staff who can view TRM, with cost and people fields masked by their access. Vendors never see this panel. New, unclassified ServiceNow fields show to staff (confirmed 2026-10-22).
- **Services**, **Capabilities** (tree), **Software models**, **Product standards**, **Servers**: lists with search, plus detail pages showing their links.
- **TRM sync runs** (system admins): history, counts and the unmatched-names report.
- **Records missing from ServiceNow** (system admins): remove flagged records, see [above](#removing-missing-records).
- Admin: **role assignment gains application and portfolio scopes** (today it offers global and department only).

## Open questions

None: all answered 2026-10-22.

## Implementation choices (to confirm)

Made while building, where the spec was silent. Each one fails closed or keeps data; tell us to change any of them.

1. **Vendors never edit TRM fields**, even with an edit role (e.g. Application owner team scoped to their application). They can only view. *(Superseded 2026-10-22: roles decide for vendors too; see [rbac-configurable.md](rbac-configurable.md).)*
2. **A vendor given a company-wide role** still sees only the applications they are assigned to.
3. **Links are rebuilt from each export that states them**: a relationship removed in ServiceNow disappears from TRM at the next sync. Records themselves are never deleted by the sync (an admin can remove flagged ones, see [Removing missing records](#removing-missing-records)).
4. **An export file with no rows is treated as not included**, so an empty file never flags every record as missing.
5. **ServiceNow dates stay as exported text** (for example `15-01-2025 10:30:00`); they are shown, not interpreted.
6. **Only https assessment links** (and http) on product standards become links; anything else from ServiceNow is shown as text.
7. **No row-level security policies** on the TRM tables: the sensitive data is column-level (costs, names), so it is masked in the service, as in the approval module.
