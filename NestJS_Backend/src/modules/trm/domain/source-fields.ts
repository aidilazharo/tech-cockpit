import type { DataClass } from '../../access/principal.js';

// Every ServiceNow field is stored as delivered. Fields are classified by name so that
// new fields are protected without a release: anything about cost is financial, and
// anything naming a person (owners, managers, leads, contacts, *_by audit users) is personal.
const FINANCIAL = /cost/;
const NOT_FINANCIAL = new Set(['cost_cc']); // currency code
const PERSONAL = /(_by$|(^|_)(owner|manager|lead|contact|assigned_to)(_|$))/;

export function classifySourceField(key: string): DataClass | null {
  if (FINANCIAL.test(key) && !NOT_FINANCIAL.has(key)) return 'financial';
  if (PERSONAL.test(key)) return 'personal';
  return null;
}

/** A copy of `source` with every field of a class the caller may not see set to null. */
export function maskSource<T extends Record<string, unknown>>(source: T, canSee: (dataClass: DataClass) => boolean): T {
  const copy: Record<string, unknown> = { ...source };
  for (const key of Object.keys(copy)) {
    const dataClass = classifySourceField(key);
    if (dataClass && !canSee(dataClass)) copy[key] = null;
  }
  return copy as T;
}
