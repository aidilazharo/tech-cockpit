# Approval engine reference

## Contents
- Concepts
- Rule set JSON
- Conditions
- Approvers and quorum
- Lifecycle and actions
- Gates (ARB before final approval)
- Delegation, escalation, reassignment
- Examples
- Code locations

## Concepts

| Term | Meaning |
|---|---|
| Workflow type | Registered in code (`business-case`, `arb-review`, `sad-version`, `project-closure`, ...) via `ApprovalWorkflowRegistry.register({ code, name, contextSchema, contextClassification, approversSeeFinancials, onStatusChange })`. |
| Rule set | Versioned list of rules for one workflow type. Draft → published → retired. Only one published version at a time. |
| Rule | `when` conditions + ordered `steps`. The first matching rule by `priority` wins. A rule with `when: null` is the fallback. |
| Step | One approval stage. Steps run in order. Parallelism happens inside a step (several approvers). |
| Instance | One record going through approval. Stores a snapshot of the matched rule's steps. |
| Task | One approver's to-do for one step and round. |

## Rule set JSON

```json
{
  "rules": [
    {
      "key": "tech-exco-band",
      "name": "Below RM250k",
      "priority": 10,
      "when": { "all": [ { "field": "tco", "op": "lt", "value": 250000 } ] },
      "steps": [
        { "key": "tech-exco", "name": "Tech EXCO", "approvers": [ { "kind": "role", "roleCode": "tech-exco" } ],
          "quorum": "any", "slaHours": 72, "reReview": "rejecters" }
      ]
    }
  ]
}
```

Validated by `RuleSetSchema` (`src/modules/approvals/domain/rule-set.schema.ts`). Keys are kebab-case and unique within their parent.

## Conditions

Group: `{ "all": [...] }` or `{ "any": [...] }`, nested up to 5 levels. Leaf: `{ "field", "op", "value" }`.

| op | value | Notes |
|---|---|---|
| `eq`, `neq` | string / number / boolean | |
| `gt`, `gte`, `lt`, `lte` | number | Band boundaries: write `gte 250000` + `lt 1000000` so RM250,000 belongs to the upper band |
| `in`, `notIn` | array | |
| `exists` | none | field present and not null |

`field` must exist in the workflow type's context schema. Publishing fails otherwise.

## Approvers and quorum

Approver specs: `{ "kind": "role", "roleCode": "...", "scope": "global" | "subject" }` (subject = only holders whose assignment scope contains the record), or `{ "kind": "user", "userId": "..." }`.

| quorum | Step completes when |
|---|---|
| `any` | any one resolved approver approves (group inbox; the other tasks are superseded) |
| `all` | every resolved approver approves (e.g. ARB members) |
| `onePerGroup` | one approval from each approver spec (e.g. Finance EXCO **and** Tech EXCO jointly) |
| `{ "count": n }` | n approvals |

`reReview`: after a rejection and resubmission, `rejecters` re-opens only the rejecting approvers' tasks (ARB rule); `all` re-opens every task in the step.

## Lifecycle and actions

Instance statuses: `in_progress` → `approved`; `returned` (rejected, waiting for resubmission); `awaiting_info` (approver asked a question); `cancelled`.

| Action | Who | Effect |
|---|---|---|
| approve | task assignee | task approved; step completes when quorum met; next step activates or instance approved |
| reject (comment required) | task assignee | instance `returned`; other tasks in the step pause |
| request info (question required) | task assignee | instance `awaiting_info`; other tasks pause |
| respond info | submitter | instance back to `in_progress`; task pending again |
| resubmit | submitter | resumes **at the rejecting step**; earlier steps stay approved; re-review per `reReview` |
| cancel | submitter | instance `cancelled`; open tasks superseded |
| reassign (reason required) | `approvals:task:reassign` | task moves to another user; original kept |

## Gates (ARB before final approval)

A step may declare `"gate": { "requiresApproved": "arb-review" }`. When that step activates and the linked instance of that workflow type for the same subject is not yet approved, its tasks are created as `blocked`. They unblock automatically when the linked instance is approved.

## Delegation, escalation, reassignment

- Out-of-office: users record delegations (from, to, start, end). Tasks created during that window go to the delegate; the original approver is recorded.
- SLA: the clock starts when a task becomes actionable (`activatedAt`; blocked tasks have none). When a pending task exceeds `slaHours`, the scheduler (every 10 minutes) reassigns it to the first eligible `escalateTo` user and records reason `sla-escalation`. Each task escalates once.
- Admin reassign: any time, reason mandatory, audited.

## Examples

Business case bands as the user described (Finance EXCO from RM250k to below RM1M; Tech EXCO below RM250k; RM1M+ to be confirmed with the user before writing):

```json
{ "key": "finance-exco-band", "priority": 20,
  "when": { "all": [ { "field": "tco", "op": "gte", "value": 250000 }, { "field": "tco", "op": "lt", "value": 1000000 } ] },
  "steps": [ { "key": "finance-exco", "name": "Finance EXCO", "approvers": [ { "kind": "role", "roleCode": "finance-exco" } ], "quorum": "any", "reReview": "rejecters",
               "gate": { "requiresApproved": "arb-review" } } ] }
```

ARB review (all members in parallel, then chair):

```json
{ "key": "arb", "priority": 10, "when": null,
  "steps": [
    { "key": "arb-members", "name": "ARB members", "approvers": [ { "kind": "role", "roleCode": "arb-member" } ], "quorum": "all", "reReview": "rejecters" },
    { "key": "arb-chair", "name": "ARB chair", "approvers": [ { "kind": "role", "roleCode": "arb-chair" } ], "quorum": "any", "reReview": "all" } ] }
```

## Code locations

| What | Where |
|---|---|
| Pure engine (conditions, rule selection, state machine) | `src/modules/approvals/domain/` |
| Workflow type registry | `src/modules/approvals/approval-workflow.registry.ts` |
| Rule sets (draft → publish → retire) | `src/modules/approvals/approval-rule-set.service.ts` |
| Submission, actions, approver resolution, delegation, gates, views | `src/modules/approvals/approval.service.ts` |
| HTTP API (maintenance, approval centre, delegations) | `src/modules/approvals/approval.controllers.ts` |
| SLA escalation job | `src/modules/approvals/approval-escalation.service.ts` |
| Permissions | `approvals:rule-set:read/manage`, `approvals:instance:read`, `approvals:task:act`, `approvals:task:reassign`, `approvals:delegation:manage` |
