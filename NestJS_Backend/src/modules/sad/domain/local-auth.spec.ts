import { describe, expect, it } from 'vitest';
import { usesLocalAuthentication } from './local-auth.js';

describe('local authentication', () => {
  it.each([
    ['local custom authentication', { 'authentication-method': { value: { selected: 'local-custom-authentication' } } }, true],
    ['another method', { 'authentication-method': { value: { selected: 'other', other: 'Kerberos' } } }, true],
    ['AD based', { 'authentication-method': { value: { selected: 'ad-based' } } }, false],
    ['not applicable', { 'authentication-method': { notApplicable: true as const, reason: 'No users' } }, false],
    ['not answered', {}, false],
  ])('is what section 5 says for %s', (_, answers, local) => {
    expect(usesLocalAuthentication(answers)).toBe(local);
  });

  it('is not said without section 5', () => {
    expect(usesLocalAuthentication(undefined)).toBe(false);
  });
});
