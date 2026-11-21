# RBAC reference

## Contents
- Model
- Permission naming
- Scopes
- Data classes and visibility
- Code locations
- Seeded roles

## Model

```
User ──< RoleAssignment >── Role ──< permission codes (role_permission)
             │                 └── dataAccess { financial, contract, personal }   (SAD sections: sad:<section>:read|update permissions)
             └── scopeType + scopeId + validFrom/validTo
```

- Roles are created and edited by admins in the app (`access:role:manage`). Okta provides identity only.
- `system-admin` implicitly holds every permission in the catalogue.
- A user's `Principal` is built per request: permissions with their scopes, merged data access, `isExternal`, auth method.

## Permission naming

`<module>:<resource>:<action>`, all lowercase kebab-case segments. Actions: `read`, `create`, `update`, `delete`, `manage` (all of CRUD), `approve`, `act`, `export`, `run`, `revoke`, `reassign`.

Declare per module with `definePermissions` and list it in `src/modules/access/permission-catalogue.ts`. The catalogue is the only place permission codes exist; a unit test fails on duplicates or bad names.

## Scopes

| scopeType | scopeId | Meaning |
|---|---|---|
| `global` | null | everywhere |
| `department` | department id | records owned by that department |
| `portfolio` | portfolio id | the portfolio and all its streams |
| `stream` | stream id | that stream only |
| `application` | business application id | that application (e.g. app owner team, vendor support) |
| `vendor` | vendor id | records linked to that vendor |

`principal.can(code)` answers "anywhere?" (used by the guard). `principal.can(code, resourceScope)` answers "for this record?" (used by services). A portfolio-scoped grant covers a record whose `portfolioId` matches, including its streams.

## Data classes and visibility

Per role, `dataAccess` sets a level for each class: `none` | `own` | `scope` | `all`.

| Level | Meaning |
|---|---|
| `none` | never |
| `own` | records the user created or submitted (`ownerId`) |
| `scope` | records inside the scope of that role assignment |
| `all` | every record |

Evaluation (`src/modules/access/data-visibility.ts`, pure function):

Vendors follow the same rules as staff (their role decides; the seeded Vendor role has `none` for every class).

1. Any assignment grants the class at `all` → allow.
2. `scope` grant whose scope contains the record → allow.
3. `own` grant and `record.ownerId === user` → allow.
4. Class `financial` and the user is an approver of the record (task active or already acted) and the approval type lets approvers see financials (`ApprovalService.approversSeeFinancials`: the setting in `approval_workflow_setting`, else the registered default) → allow.
5. Otherwise deny; the field is returned as `null`.

A field's class is not fixed in code: modules register their classified fields (`FieldClassRegistry`, keys `<module>.<record>.<field>`) with a default, and administrators holding `access:field-class:manage` change them. `internal` means anyone who can read the record sees it. An unregistered key is treated as financial.

Business rules from the requirements this must express:

- Portfolio lead: financial = `scope` with a portfolio or stream assignment.
- Product manager: financial = `own`.
- Solution/enterprise architect, PMO, EXCO: configurable per role (default `all`).
- Approvers: rule 5.
- Vendors: their role (seeded Vendor role: no classified data).

## Code locations

| What | Where |
|---|---|
| Permission catalogue | `src/modules/access/permission-catalogue.ts` |
| Principal | `src/modules/access/principal.ts` |
| Guards | `src/modules/access/guards.ts` (AuthGuard, fail-closed PermissionGuard) |
| Decorators | `src/modules/access/decorators.ts`: `@RequirePermission`, `@Authenticated(reason)`, `@Public(reason)`, `@CurrentPrincipal`, `@AuditResource` |
| Anti-escalation | `AccessService.assertCanGrant` in `src/modules/access/access.service.ts` |
| Visibility policy | `src/modules/access/data-visibility.ts` |
| Field classification | `src/modules/access/field-classes.ts` (registry, `FieldClassService`, `canViewField`); TRM fields `trm/trm-fields.ts`, SAD `sad/sad-fields.ts`, approval context fields registered by `ApprovalWorkflowRegistry` |
| Can act for staff | `role.canActForStaff`; `actingForStaff()` in `src/modules/access/acting-for-staff.ts` |
| Seeded roles | migration `*_initial_foundation` (hand-written insert) |

## Seeded roles

`system-admin`, `portfolio-lead`, `product-manager`, `solution-architect`, `enterprise-architect`, `arb-member`, `arb-chair`, `pmo`, `tech-exco`, `finance-exco`, `vendor`. Admins can change their permissions and data access, and create new roles.

One person may hold several roles. Today the enterprise architect holds `enterprise-architect`, `arb-member` and `arb-chair`, approving the ARB reviewer step and then the chair step. Never merge roles because one person holds them, and never add a rule that stops a person approving two different steps (tested in `test/e2e/approvals.e2e-spec.ts`).
