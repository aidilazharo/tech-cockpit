import { createHash } from 'node:crypto';

/** One exported ServiceNow row: field name → display value. */
export type SourceRecord = Record<string, unknown>;

/** A display value as trimmed text; blanks and the literal "null" (as exported) mean no value. */
export function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = (typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean | bigint)).trim();
  return trimmed === '' || trimmed === 'null' ? null : trimmed;
}

/** An amount as a 2-decimal string, or null when the value is not a plain number. */
export function decimal(value: unknown): string | null {
  const raw = text(value)?.replaceAll(',', '');
  if (!raw || !/^-?\d{1,13}(\.\d+)?$/.test(raw)) return null;
  return Number(raw).toFixed(2);
}

export function isTrue(value: unknown): boolean {
  return text(value) === 'true';
}

/** JSON with object keys sorted at every level, so equal content gives equal text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 of the content: lets the sync skip records that did not change. */
export function contentHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
