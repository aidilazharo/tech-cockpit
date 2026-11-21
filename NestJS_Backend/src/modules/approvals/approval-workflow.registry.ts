import { Injectable, NotFoundException } from '@nestjs/common';
import { z, type ZodObject, type ZodType } from 'zod';
import { FieldClassRegistry } from '../access/field-classes.js';
import type { DataClass, Principal } from '../access/principal.js';
import type { InstanceStatus } from './domain/engine.js';

export interface ApprovalStatusEvent {
  instanceId: string;
  workflowCode: string;
  subjectType: string;
  subjectId: string;
  status: InstanceStatus;
}

/** Registered in code by each approvable module (see the rbac-approvals skill). */
export interface ApprovalWorkflowType {
  /** kebab-case, e.g. business-case, arb-review, sad-version, project-closure */
  code: string;
  name: string;
  description?: string;
  /** The routing fields rules may use. Validated on every submission. */
  contextSchema: ZodObject;
  /**
   * Default classes of context fields, e.g. { tco: 'financial' }; unlisted fields are internal.
   * Without it every field is financial. Administrators can change them (field classification).
   */
  contextClassification?: Record<string, DataClass>;
  /** May approvers see financial data of what they approve? */
  approversSeeFinancials: boolean;
  /** Called after each status change is committed. */
  onStatusChange?: (event: ApprovalStatusEvent) => void | Promise<void>;
  /**
   * For records checked and updated when resubmitted (e.g. a SAD): the Approval Centre's Resubmit goes through
   * the module, which resubmits within its own transaction (ApprovalService.resubmitIn).
   */
  resubmit?: (principal: Principal, subjectId: string) => Promise<unknown>;
}

export const CONTEXT_FIELD_TYPES = ['number', 'string', 'boolean', 'enum', 'date', 'list', 'unknown'] as const;
export type ContextFieldType = (typeof CONTEXT_FIELD_TYPES)[number];

export interface ContextField {
  path: string;
  type: ContextFieldType;
  /** Allowed values of an enum field */
  values: string[] | null;
}

function unwrap(schema: ZodType): ZodType {
  let inner = schema;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable || inner instanceof z.ZodDefault) {
    inner = (inner as z.ZodOptional<ZodType>).unwrap() as ZodType;
  }
  return inner;
}

// Zod's own type tag: string formats (uuid, email...) are all 'string'.
const TYPE_BY_DEF: Partial<Record<string, ContextFieldType>> = {
  number: 'number',
  string: 'string',
  boolean: 'boolean',
  enum: 'enum',
  date: 'date',
  array: 'list',
};

function describeField(path: string, schema: ZodType): ContextField {
  const type = TYPE_BY_DEF[schema._zod.def.type] ?? 'unknown';
  const values = schema instanceof z.ZodEnum ? (schema.options as unknown[]).map(String) : null;
  return { path, type, values };
}

function fields(schema: ZodObject, prefix = ''): ContextField[] {
  return Object.entries(schema.shape).flatMap(([key, value]) => {
    const inner = unwrap(value as ZodType);
    return inner instanceof z.ZodObject ? fields(inner, `${prefix}${key}.`) : [describeField(`${prefix}${key}`, inner)];
  });
}

/** The field-classification key of a context field. */
export const contextFieldKey = (code: string, field: string) => `approvals.${code}.${field}`;

@Injectable()
export class ApprovalWorkflowRegistry {
  private readonly types = new Map<string, ApprovalWorkflowType>();

  constructor(private readonly fieldClasses: FieldClassRegistry) {}

  register(type: ApprovalWorkflowType): void {
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(type.code)) {
      throw new Error(`Invalid workflow code "${type.code}"`);
    }
    if (this.types.has(type.code)) {
      throw new Error(`Workflow type "${type.code}" is already registered`);
    }
    this.types.set(type.code, type);
    this.fieldClasses.register(
      ...Object.keys(type.contextSchema.shape).map((field) => ({
        key: contextFieldKey(type.code, field),
        module: 'approvals',
        label: `${type.name}: ${field}`,
        defaultClass: type.contextClassification ? (type.contextClassification[field] ?? 'internal') : 'financial',
      })),
    );
  }

  get(code: string): ApprovalWorkflowType {
    const type = this.types.get(code);
    if (!type) throw new NotFoundException(`Unknown approval workflow type "${code}"`);
    return type;
  }

  list(): ApprovalWorkflowType[] {
    return [...this.types.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  contextFields(code: string): string[] {
    return this.contextFieldTypes(code).map((field) => field.path);
  }

  /** The routing fields with their types (for the rule maintenance screen). */
  contextFieldTypes(code: string): ContextField[] {
    return fields(this.get(code).contextSchema);
  }

  /** Display name of a workflow type; the code itself for an unregistered one. */
  nameOf(code: string): string {
    return this.types.get(code)?.name ?? code;
  }
}
