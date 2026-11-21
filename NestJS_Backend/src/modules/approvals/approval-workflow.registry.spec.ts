import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FieldClassRegistry } from '../access/field-classes.js';
import { ApprovalWorkflowRegistry } from './approval-workflow.registry.js';
import { ENGINE_ERRORS, engine } from './approval.service.js';
import { ApprovalEngineError } from './domain/engine.js';

const base = { name: 'Test', approversSeeFinancials: false };

describe('ApprovalWorkflowRegistry', () => {
  it('registers a type and lists its routing fields, including nested and optional ones', () => {
    const registry = new ApprovalWorkflowRegistry(new FieldClassRegistry());
    registry.register({
      ...base,
      code: 'business-case',
      contextSchema: z.object({
        tco: z.number(),
        department: z.object({ code: z.string() }).optional(),
        budget: z.object({ capex: z.number(), opex: z.number().nullable() }).nullable(),
        tags: z.array(z.string()).default([]),
      }),
    });
    expect(registry.contextFields('business-case')).toEqual(['tco', 'department.code', 'budget.capex', 'budget.opex', 'tags']);
    expect(registry.list().map((type) => type.code)).toEqual(['business-case']);
  });

  it('describes each routing field with its type, so the rule screen can offer the right input', () => {
    const registry = new ApprovalWorkflowRegistry(new FieldClassRegistry());
    registry.register({
      ...base,
      code: 'business-case',
      contextSchema: z.object({
        tco: z.number(),
        departmentId: z.uuid().nullable(),
        urgent: z.boolean().optional(),
        category: z.enum(['run', 'change']),
        requestedOn: z.date(),
        tags: z.array(z.string()).default([]),
        extra: z.unknown(),
      }),
    });

    expect(registry.contextFieldTypes('business-case')).toEqual([
      { path: 'tco', type: 'number', values: null },
      { path: 'departmentId', type: 'string', values: null },
      { path: 'urgent', type: 'boolean', values: null },
      { path: 'category', type: 'enum', values: ['run', 'change'] },
      { path: 'requestedOn', type: 'date', values: null },
      { path: 'tags', type: 'list', values: null },
      { path: 'extra', type: 'unknown', values: null },
    ]);
    expect(registry.nameOf('business-case')).toBe('Test');
    expect(registry.nameOf('not-registered')).toBe('not-registered');
  });

  it('lists types in code order', () => {
    const registry = new ApprovalWorkflowRegistry(new FieldClassRegistry());
    registry.register({ ...base, code: 'sad-version', contextSchema: z.object({}) });
    registry.register({ ...base, code: 'arb-review', contextSchema: z.object({}) });
    expect(registry.list().map((type) => type.code)).toEqual(['arb-review', 'sad-version']);
  });

  it('rejects an invalid code and a duplicate registration', () => {
    const registry = new ApprovalWorkflowRegistry(new FieldClassRegistry());
    expect(() => registry.register({ ...base, code: 'Business Case', contextSchema: z.object({}) })).toThrow(/Invalid workflow code/);
    registry.register({ ...base, code: 'arb-review', contextSchema: z.object({}) });
    expect(() => registry.register({ ...base, code: 'arb-review', contextSchema: z.object({}) })).toThrow(/already registered/);
  });

  it('registers the context fields for field classification: financial unless the type classifies them', () => {
    const fields = new FieldClassRegistry();
    const registry = new ApprovalWorkflowRegistry(fields);
    registry.register({ ...base, name: 'Business case', code: 'business-case', contextSchema: z.object({ tco: z.number(), department: z.object({ code: z.string() }) }) });
    registry.register({ ...base, code: 'arb-review', contextSchema: z.object({ tco: z.number(), stream: z.string() }), contextClassification: { tco: 'financial' } });
    expect(fields.list()).toEqual([
      { key: 'approvals.arb-review.stream', module: 'approvals', label: 'Test: stream', defaultClass: 'internal' },
      { key: 'approvals.arb-review.tco', module: 'approvals', label: 'Test: tco', defaultClass: 'financial' },
      { key: 'approvals.business-case.department', module: 'approvals', label: 'Business case: department', defaultClass: 'financial' },
      { key: 'approvals.business-case.tco', module: 'approvals', label: 'Business case: tco', defaultClass: 'financial' },
    ]);
  });

  it('answers 404 for an unknown type', () => {
    expect(() => new ApprovalWorkflowRegistry(new FieldClassRegistry()).get('nope')).toThrow(NotFoundException);
  });
});

describe('engine error mapping', () => {
  it.each([
    ['no_approvers', 422],
    ['task_not_found', 404],
    ['task_not_pending', 409],
    ['not_assignee', 403],
    ['instance_not_active', 409],
    ['comment_required', 400],
    ['not_submitter', 403],
    ['invalid_state', 409],
  ] as const)('maps %s to HTTP %s', (code, status) => {
    expect(ENGINE_ERRORS[code]('x').getStatus()).toBe(status);
    try {
      engine(() => {
        throw new ApprovalEngineError(code, 'msg');
      });
      expect.unreachable();
    } catch (error) {
      expect((error as { getStatus(): number }).getStatus()).toBe(status);
    }
  });

  it('passes through results and unrelated errors', () => {
    expect(engine(() => 42)).toBe(42);
    expect(() =>
      engine(() => {
        throw new TypeError('bug');
      }),
    ).toThrow(TypeError);
  });
});
