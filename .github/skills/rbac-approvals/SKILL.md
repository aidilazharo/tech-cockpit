---
name: rbac-approvals
description: Rules for TechCockpit role-based access control and the configurable approval engine. Covers permission naming, role scopes, financial/contract/security/personal data visibility, vendor restrictions, registering a new approval workflow type, approval rule JSON (amount bands, conditions, sequential and parallel steps, quorum, delegation, SLA escalation, ARB gates) and the required test matrix. Use whenever adding or changing permissions, roles, data visibility, approval flows, approvers, or anything approvable.
---

# RBAC and approval engine

Two systems, both enforced server-side. The frontend only hides what the API already refuses.

1. **RBAC** decides _what a user may do_ (permissions, scoped by department, portfolio, stream, application or vendor) and _what classified data they may see_. Read [reference/rbac.md](./reference/rbac.md).
2. **Approval engine** routes approvable records through admin-maintained rules. Workflow _types_ are registered in code; _rules_ (bands, approvers, steps, conditions) are data edited in the maintenance screen. Read [reference/approval-rules.md](./reference/approval-rules.md).

## Non-negotiable rules

- Vendors (`isExternal` users) follow their role like anyone else (product owner, 2026-10-22): they see financial, contract or personal data only when their role's data access grants it. The seeded Vendor role grants none. Vendors can never be system administrators (fixed in code).
- SAD sections are the exception by design (product owner, 2026-10-22): each section has its own View/Edit permissions (`sad:<section>:read|update`) and vendors get exactly what their role grants.
- Every API route declares `@RequirePermission(code)`, or `@Authenticated(reason)` / `@Public(reason)`. The permission guard refuses routes with no declaration (fail-closed).
- Anti-escalation: a non-admin can only grant permissions and data-access levels they hold and cannot change their own assignments. Granting or removing `system-admin` needs `access:system-admin:manage`, and it is never given to external users or to yourself.
- Segregation of duties: a submitter is never resolved as an approver of their own request, and a task cannot be reassigned to the submitter.
- Scope checks happen in the service against the actual record, not only in the guard.
- Classified fields are masked (returned as `null`) before the response leaves the service; response schemas strip unknown fields.
- Rule sets are versioned. An instance stores a snapshot of the steps it started with; publishing a new rule version never changes in-flight approvals.
- Approvers see an item's financial data from when their task becomes active, and keep read access after acting, if the workflow type allows it. `approversSeeFinancials` in code is the default; rule maintainers change it per type (`PATCH /approval-workflows/:code`, stored in `approval_workflow_setting`).
- Which fields are financial, contract, personal or internal is data: each module registers its classified fields in `FieldClassRegistry` with a default class, and holders of `access:field-class:manage` override them (`/field-classes`, audited). Services mask through `FieldClassService.classes(em).viewer(principal, context)`, never by a hard-coded class.
- Out-of-office delegates and EA roadmap owners must hold a role with **Can act for staff** (`role.canActForStaff`; `actingForStaff()` in `access/acting-for-staff.ts`). Fixed rules that stay in code are listed in `docs/modules/rbac-configurable.md`.

## Adding a new approvable workflow type

```
Workflow type progress:
- [ ] 1. Confirm with the user: who submits, which fields drive routing, what happens on approve/return/cancel, whether approvers see financials
- [ ] 2. Context schema (Zod) listing the routing fields, e.g. { tco: number, departmentCode: string }
- [ ] 3. Register the type in the module's onModuleInit via ApprovalWorkflowRegistry.register(...)
- [ ] 4. Seed a default rule set (draft) in a migration only if the user supplied the rules
- [ ] 5. Subject module calls ApprovalService.submit(...) and implements onStatusChange
- [ ] 6. Tests from reference/test-matrix.md (all rows that apply)
```

What the platform already does for every workflow type (do not rebuild it in the module):

- **Approval Centre** screens (Waiting for me, My requests, All approvals, Done by me), the item timeline, decisions, questions/answers, resubmit, cancel, admin reassign and out-of-office delegation.
- **In-app notifications** for tasks waiting, outcomes, questions/answers, reassignment, escalation and the SLA reminder at 75% (`src/modules/approvals/domain/notifications.ts`, sent after commit). A new event type needs an entry in `NOTIFICATION_TYPES` (`src/modules/notifications/notification-types.ts`), a rule + unit test in `domain/notifications.ts`, and its text in the web app (`notifications.types.<type with dots as hyphens>`).
- Give the type a human `name`: it is shown on every item, notification and the rule screen. Its context field types drive the rule screen's condition inputs (number, enum values, yes/no).

## Changing rules

Rules are data. Change them through the maintenance API or screen (`approvals:rule-set:manage`), never by editing code. Code changes are only needed for a new workflow type, a new routing field, or a new condition operator. Each of those needs the full test matrix: [reference/test-matrix.md](./reference/test-matrix.md).
