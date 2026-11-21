import { describe, expect, it } from 'vitest';
import { NameIndex } from './name-index.js';

describe('matching ServiceNow names', () => {
  const index = new NameIndex([
    { id: 'a', name: 'CRM' },
    { id: 'b', name: 'Billing' },
    { id: 'c', name: 'Billing' },
    { id: 'd', name: null },
  ], (item) => item.name, (item) => item.id);

  it('finds a unique name, ignoring surrounding spaces', () => {
    expect(index.resolve(' CRM ')).toEqual({ kind: 'one', id: 'a' });
  });

  it('reports names it cannot match, or that match several records', () => {
    expect(index.resolve('crm')).toEqual({ kind: 'none' });
    expect(index.resolve('')).toEqual({ kind: 'none' });
    expect(index.resolve(null)).toEqual({ kind: 'none' });
    expect(index.resolve('Billing')).toEqual({ kind: 'many', count: 2 });
  });
});
