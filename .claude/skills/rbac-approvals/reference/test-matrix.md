# Required tests for RBAC and approval changes

Every row that applies must have a test. Positive and negative cases both count.

## Permissions and scope

| # | Case | Expect |
|---|---|---|
| P1 | No credentials | 401 problem+json |
| P2 | Valid user without the permission | 403 |
| P3 | Permission in another scope (other portfolio/stream/department) | 403 or 404, never data |
| P4 | Permission in matching scope | 200 |
| P5 | Expired or revoked role assignment | 403 |
| P6 | Disabled user with valid API key | 401 |
| P7 | system-admin | allowed |

## Data visibility

| # | Case | Expect |
|---|---|---|
| V1 | Vendor with a role granting financial `all` | financial fields `null` |
| V2 | Product manager, own record | financial visible |
| V3 | Product manager, someone else's record | financial `null` |
| V4 | Portfolio lead, record in own portfolio / other portfolio | visible / `null` |
| V5 | Approver before task active / while active / after acting | `null` / visible / visible |
| V6 | Approver when workflow type has `approversSeeFinancials: false` | `null` |
| V7 | Response contains no field absent from the response schema | stripped |

## Rules

| # | Case | Expect |
|---|---|---|
| R1 | Amount just below, exactly on, just above each band boundary | correct rule each time |
| R2 | No rule matches and no fallback | submit fails with 422, nothing persisted |
| R3 | Condition on a field not in the context schema | publishing fails with 400 |
| R4 | Two published versions | impossible; publishing retires the previous one |
| R5 | Rule changed after submission | in-flight instance keeps its snapshot |

## Lifecycle

| # | Case | Expect |
|---|---|---|
| L1 | Sequential steps all approve | instance approved; subject notified |
| L2 | `any` quorum | first approval completes the step; other tasks superseded |
| L3 | `all` quorum (ARB) | step completes only after every member approves |
| L4 | `onePerGroup` | needs one approval per group |
| L5 | Reject without comment | 400 |
| L6 | Reject → resubmit | resumes at the rejecting step; earlier steps untouched |
| L7 | ARB: one member rejects → resubmit with `reReview: rejecters` | only that member gets a new task; earlier approvals kept |
| L8 | Request info → respond | same task back to pending |
| L9 | Non-assignee tries to act | 403 |
| L10 | Acting on a superseded / already-acted task | 409 |
| L11 | Submitter cancels | open tasks superseded |
| L12 | Gate: final step activates before ARB approved | tasks blocked; unblock when ARB approved |
| L13 | Approver resolves to nobody | submit fails with 422 naming the step |

## Delegation and escalation

| # | Case | Expect |
|---|---|---|
| D1 | Task created during delegation window | assigned to delegate, original recorded |
| D2 | Task created outside window | original approver |
| D3 | Delegation to self or overlapping window | 400 |
| D4 | SLA exceeded with `escalateTo` | reassigned, reason `sla-escalation`, audited |
| D5 | Admin reassign without reason | 400 |
