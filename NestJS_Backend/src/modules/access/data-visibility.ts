import { type DataClass, type Principal, type ResourceScope, scopeContains } from './principal.js';

export interface VisibilityContext {
  /** Creator/submitter of the record (for "own" access). */
  ownerId?: string | null;
  scope: ResourceScope;
  /** The user holds (or held) an active approval task on this record. */
  approverOf?: boolean;
  /** Workflow-type flag: may approvers see financials of what they approve? */
  approversSeeFinancials?: boolean;
}

/**
 * Whether the principal may see data of the given class on a record. Rules, in order (vendors
 * follow their role like anyone else; the seeded Vendor role grants no data access):
 * 1. A grant with level "all": yes.
 * 2. A grant with level "scope" whose assignment scope contains the record: yes.
 * 3. A grant with level "own" and the user owns the record: yes.
 * 4. Financial data, the user is an approver of the record, and the workflow allows it: yes.
 * 5. Otherwise no.
 */
export function canViewClass(principal: Principal, dataClass: DataClass, context: VisibilityContext): boolean {
  // Vendors follow their role like anyone else (product owner, 2026-10-22); the seeded Vendor role grants none.
  for (const grant of principal.grants) {
    const level = grant.dataAccess[dataClass];
    if (level === 'all') return true;
    if (level === 'scope' && scopeContains(grant.scope, context.scope)) return true;
    if (level === 'own' && context.ownerId != null && context.ownerId === principal.user.id) return true;
  }
  return (
    dataClass === 'financial' && context.approverOf === true && context.approversSeeFinancials === true
  );
}

/** Returns a copy with every classified field the principal may not see set to null. */
export function maskClassified<T extends object>(
  record: T,
  classification: Partial<Record<keyof T, DataClass>>,
  principal: Principal,
  context: VisibilityContext,
): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const [field, dataClass] of Object.entries(classification) as [string, DataClass][]) {
    if (!canViewClass(principal, dataClass, context)) {
      copy[field] = null;
    }
  }
  return copy as T;
}
