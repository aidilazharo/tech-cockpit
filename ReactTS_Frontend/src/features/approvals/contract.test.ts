import { describe, it } from 'vitest'
import { expectAcceptedRequest, expectSameResponse } from '../../test/contract'
import { AuditEntrySchema, AuditFacetsSchema } from '../audit/schemas'
import { NotificationPageSchema, NotificationSchema, UnreadCountSchema } from '../notifications/schemas'
import { PersonSchema } from '../people/schemas'
import * as schemas from './schemas'

describe('Approval Centre, notifications, people and audit responses match the API contract', () => {
  it.each([
    ['ApprovalInstance', schemas.InstanceSchema],
    ['ApprovalDecisionPage', schemas.DecisionPageSchema],
    ['ApprovalDelegation', schemas.DelegationSchema],
    ['ApprovalRuleSet', schemas.RuleSetSchema],
    ['ApprovalRuleOptions', schemas.RuleOptionsSchema],
    ['PersonRef', schemas.PersonRefSchema],
    ['ApprovalWorkflowSetting', schemas.WorkflowSettingSchema],
    ['Notification', NotificationSchema],
    ['NotificationPage', NotificationPageSchema],
    ['UnreadCount', UnreadCountSchema],
    ['Person', PersonSchema],
    ['AuditEntry', AuditEntrySchema],
    ['AuditFacets', AuditFacetsSchema],
  ] as const)('%s', (name, schema) => expectSameResponse(name, schema))
})

describe('approval requests only send what the API accepts', () => {
  it.each([
    ['ApproveTask', schemas.ApproveRequest],
    ['TaskComment', schemas.CommentRequest],
    ['RespondInfo', schemas.RespondInfoRequest],
    ['ReassignTask', schemas.ReassignRequest],
    ['CreateDelegation', schemas.CreateDelegationRequest],
    ['CreateDelegationFor', schemas.CreateDelegationForRequest],
    ['UpdateApprovalWorkflow', schemas.UpdateWorkflowRequest],
    ['CreateApprovalRuleSet', schemas.CreateRuleSetRequest],
    ['UpdateApprovalRuleSet', schemas.UpdateRuleSetRequest],
  ] as const)('%s', (name, schema) => expectAcceptedRequest(name, schema))
})
