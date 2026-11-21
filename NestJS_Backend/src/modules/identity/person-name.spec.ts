import { describe, expect, it } from 'vitest';
import { personName } from './person-name.js';

describe('personName', () => {
  it('uses first and last name, or the Okta username when no name has been entered', () => {
    expect(personName({ firstName: 'Ada', lastName: 'Admin', username: 'ada@aia.com' })).toBe('Ada Admin');
    expect(personName({ firstName: 'Ada', lastName: '', username: 'ada@aia.com' })).toBe('Ada');
    expect(personName({ firstName: ' ', lastName: '', username: 'a1234567' })).toBe('a1234567');
  });
});
