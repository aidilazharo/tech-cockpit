import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { api } from '../../lib/api'
import {
  type CreateDelegationForRequest,
  type CreateDelegationRequest,
  type CreateRuleSetRequest,
  DecisionPageSchema,
  DelegationListSchema,
  DelegationSchema,
  type InstanceStatus,
  InstancePageSchema,
  InstanceSchema,
  MyTaskListSchema,
  RuleOptionsSchema,
  RuleSetListSchema,
  RuleSetSchema,
  type UpdateRuleSetRequest,
  WorkflowListSchema,
  WorkflowSettingSchema,
} from './schemas'

export const PAGE_SIZE = 25

export const approvalKeys = {
  all: ['approvals'] as const,
  tasks: ['approvals', 'tasks'] as const,
  instance: (id: string) => ['approvals', 'instance', id] as const,
  instances: (filters: InstanceFilters) => ['approvals', 'instances', filters] as const,
  decisions: (page: number) => ['approvals', 'decisions', page] as const,
  delegations: ['approvals', 'delegations'] as const,
  delegationsOf: (userId: string) => ['approvals', 'delegations', 'of', userId] as const,
  workflows: ['approval-rules', 'workflows'] as const,
  options: ['approval-rules', 'options'] as const,
  ruleSets: (workflowCode: string) => ['approval-rules', 'rule-sets', workflowCode] as const,
  ruleSet: (id: string) => ['approval-rules', 'rule-set', id] as const,
}

export interface InstanceFilters {
  mine: boolean
  status?: InstanceStatus
  workflowCode?: string
  page: number
}

// After any decision: the item, every list and the notification badge may change.
function refreshAfterAction(client: QueryClient, instance: z.infer<typeof InstanceSchema>) {
  client.setQueryData(approvalKeys.instance(instance.id), instance)
  void client.invalidateQueries({ queryKey: approvalKeys.all })
  void client.invalidateQueries({ queryKey: ['notifications'] })
}

// ----- Approval Centre -------------------------------------------------------

export function useMyTasks(enabled = true) {
  return useQuery({
    queryKey: approvalKeys.tasks,
    queryFn: ({ signal }) => api('/api/v1/approval-tasks', { schema: MyTaskListSchema, signal }),
    enabled,
  })
}

export function useInstance(id: string) {
  return useQuery({
    queryKey: approvalKeys.instance(id),
    queryFn: ({ signal }) => api(`/api/v1/approval-instances/${id}`, { schema: InstanceSchema, signal }),
  })
}

export function useInstances(filters: InstanceFilters) {
  return useQuery({
    queryKey: approvalKeys.instances(filters),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        page: String(filters.page),
        pageSize: String(PAGE_SIZE),
        mine: String(filters.mine),
        ...(filters.status && { status: filters.status }),
        ...(filters.workflowCode && { workflowCode: filters.workflowCode }),
      })
      return api(`/api/v1/approval-instances?${params}`, { schema: InstancePageSchema, signal })
    },
    placeholderData: keepPreviousData,
  })
}

export function useDecisions(page: number) {
  return useQuery({
    queryKey: approvalKeys.decisions(page),
    queryFn: ({ signal }) => api(`/api/v1/me/approval-decisions?page=${page}&pageSize=${PAGE_SIZE}`, { schema: DecisionPageSchema, signal }),
    placeholderData: keepPreviousData,
  })
}

type TaskAction = 'approve' | 'reject' | 'request-info'

/** Approve (optional comment), reject or return for more information (comment required). */
export function useTaskAction(action: TaskAction) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, comment }: { taskId: string; comment: string }) =>
      api(`/api/v1/approval-tasks/${taskId}/${action}`, {
        method: 'POST',
        body: action === 'approve' && !comment ? {} : { comment },
        schema: InstanceSchema,
      }),
    onSuccess: (instance) => refreshAfterAction(client, instance),
  })
}

export function useReassignTask() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, toUserId, reason }: { taskId: string; toUserId: string; reason: string }) =>
      api(`/api/v1/approval-tasks/${taskId}/reassign`, { method: 'POST', body: { toUserId, reason }, schema: InstanceSchema }),
    onSuccess: (instance) => refreshAfterAction(client, instance),
  })
}

export function useRespondInfo(instanceId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (answer: string) =>
      api(`/api/v1/approval-instances/${instanceId}/respond-info`, { method: 'POST', body: { answer }, schema: InstanceSchema }),
    onSuccess: (instance) => refreshAfterAction(client, instance),
  })
}

export function useInstanceAction(instanceId: string, action: 'resubmit' | 'cancel') {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api(`/api/v1/approval-instances/${instanceId}/${action}`, { method: 'POST', schema: InstanceSchema }),
    onSuccess: (instance) => refreshAfterAction(client, instance),
  })
}

// ----- Delegation (out of office) ------------------------------------------

export function useDelegations() {
  return useQuery({
    queryKey: approvalKeys.delegations,
    queryFn: ({ signal }) => api('/api/v1/me/delegations', { schema: DelegationListSchema, signal }),
  })
}

export function useCreateDelegation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof CreateDelegationRequest>) =>
      api('/api/v1/me/delegations', { method: 'POST', body, schema: DelegationSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: approvalKeys.delegations }),
  })
}

export function useCancelDelegation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/v1/me/delegations/${id}/cancel`, { method: 'POST', schema: DelegationSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: approvalKeys.delegations }),
  })
}

// ----- Someone else's delegations (approvals:any-delegation:manage) ----------------

export function useDelegationsOf(userId: string) {
  return useQuery({
    queryKey: approvalKeys.delegationsOf(userId),
    queryFn: ({ signal }) => api(`/api/v1/approval-delegations?userId=${userId}`, { schema: DelegationListSchema, signal }),
  })
}

export function useCreateDelegationFor() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof CreateDelegationForRequest>) => api('/api/v1/approval-delegations', { method: 'POST', body, schema: DelegationSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: approvalKeys.delegations }),
  })
}

export function useCancelDelegationFor() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/v1/approval-delegations/${id}/cancel`, { method: 'POST', schema: DelegationSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: approvalKeys.delegations }),
  })
}

// ----- Rule maintenance -----------------------------------------------------

export function useWorkflows() {
  return useQuery({
    queryKey: approvalKeys.workflows,
    queryFn: ({ signal }) => api('/api/v1/approval-workflows', { schema: WorkflowListSchema, signal }),
    staleTime: Infinity,
  })
}

/** Whether approvers see the financial data of what they approve, per approval type. */
export function useUpdateWorkflow(code: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (approversSeeFinancials: boolean) =>
      api(`/api/v1/approval-workflows/${encodeURIComponent(code)}`, { method: 'PATCH', body: { approversSeeFinancials }, schema: WorkflowSettingSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: approvalKeys.workflows }),
  })
}

export function useRuleOptions() {
  return useQuery({
    queryKey: approvalKeys.options,
    queryFn: ({ signal }) => api('/api/v1/approval-rule-options', { schema: RuleOptionsSchema, signal }),
  })
}

export function useRuleSets(workflowCode: string) {
  return useQuery({
    queryKey: approvalKeys.ruleSets(workflowCode),
    queryFn: ({ signal }) =>
      api(`/api/v1/approval-rule-sets?workflowCode=${encodeURIComponent(workflowCode)}`, { schema: RuleSetListSchema, signal }),
  })
}

export function useRuleSet(id: string | null) {
  return useQuery({
    queryKey: approvalKeys.ruleSet(id ?? ''),
    queryFn: ({ signal }) => api(`/api/v1/approval-rule-sets/${id}`, { schema: RuleSetSchema, signal }),
    enabled: Boolean(id),
  })
}

export function useCreateRuleSet() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof CreateRuleSetRequest>) => api('/api/v1/approval-rule-sets', { method: 'POST', body, schema: RuleSetSchema }),
    onSuccess: (ruleSet) => client.invalidateQueries({ queryKey: approvalKeys.ruleSets(ruleSet.workflowCode) }),
  })
}

export function useUpdateRuleSet(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof UpdateRuleSetRequest>) =>
      api(`/api/v1/approval-rule-sets/${id}`, { method: 'PATCH', body, schema: RuleSetSchema }),
    onSuccess: (ruleSet) => {
      client.setQueryData(approvalKeys.ruleSet(id), ruleSet)
      return client.invalidateQueries({ queryKey: approvalKeys.ruleSets(ruleSet.workflowCode) })
    },
  })
}

export function usePublishRuleSet() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/v1/approval-rule-sets/${id}/publish`, { method: 'POST', schema: RuleSetSchema }),
    onSuccess: (ruleSet) => {
      client.setQueryData(approvalKeys.ruleSet(ruleSet.id), ruleSet)
      return client.invalidateQueries({ queryKey: approvalKeys.ruleSets(ruleSet.workflowCode) })
    },
  })
}
