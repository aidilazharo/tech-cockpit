import { describe, expect, it } from 'vitest';
import { canViewField, FieldClasses, FieldClassRegistry } from './field-classes.js';
import { Principal } from './principal.js';

const field = { key: 'trm.application.licenceCost', module: 'trm', label: 'Licence cost', defaultClass: 'financial' as const };
const nobody = new Principal({ id: 'u', username: 'u', email: 'u@aia.com', firstName: 'U', lastName: 'U', isExternal: false }, [], { method: 'api-key' }, false);

describe('FieldClassRegistry', () => {
  it('lists registered fields by key, and accepts the same field twice', () => {
    const registry = new FieldClassRegistry();
    registry.register({ ...field, key: 'trm.service.ownedBy', defaultClass: 'personal' }, field);
    registry.register(field);
    expect(registry.list().map((f) => f.key)).toEqual(['trm.application.licenceCost', 'trm.service.ownedBy']);
    expect(registry.get('trm.service.ownedBy')?.defaultClass).toBe('personal');
    expect(registry.get('nope')).toBeUndefined();
  });

  it('refuses a bad or over-long key, and a field registered again with another class', () => {
    const registry = new FieldClassRegistry();
    expect(() => registry.register({ ...field, key: 'No Dots' })).toThrow(/Invalid field key/);
    expect(() => registry.register({ ...field, key: `trm.${'x'.repeat(100)}` })).toThrow(/Invalid field key/);
    registry.register(field);
    expect(() => registry.register({ ...field, defaultClass: 'personal' })).toThrow(/already registered with another class/);
  });
});

describe('FieldClasses', () => {
  it('treats a field nobody registered as financial (fail closed), and internal data as visible to all readers', () => {
    const classes = new FieldClasses(new Map([['trm.application.internalNote', 'internal']]));
    expect(classes.of('unknown.field')).toBe('financial');
    const see = classes.viewer(nobody, { scope: {} });
    expect(see('trm.application.internalNote')).toBe(true);
    expect(see('unknown.field')).toBe(false);
    expect(canViewField(nobody, 'personal', { scope: {} })).toBe(false);
  });
});
