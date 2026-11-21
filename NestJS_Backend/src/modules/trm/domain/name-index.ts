export type NameMatch = { kind: 'one'; id: string } | { kind: 'none' } | { kind: 'many'; count: number };

/**
 * Finds records by their ServiceNow name (exact, trimmed). The path exports carry names
 * only, so a name that matches nothing or several records is reported, never guessed.
 */
export class NameIndex<T> {
  private readonly ids = new Map<string, string[]>();

  constructor(items: Iterable<T>, nameOf: (item: T) => string | null, idOf: (item: T) => string) {
    for (const item of items) {
      const name = nameOf(item)?.trim();
      if (!name) continue;
      this.ids.set(name, [...(this.ids.get(name) ?? []), idOf(item)]);
    }
  }

  resolve(name: string | null | undefined): NameMatch {
    const ids = name ? this.ids.get(name.trim()) : undefined;
    if (!ids) return { kind: 'none' };
    return ids.length === 1 ? { kind: 'one', id: ids[0] } : { kind: 'many', count: ids.length };
  }
}
