import { describe, expect, it } from 'vitest';
import { contentHash, decimal, isTrue, stableStringify, text } from './values.js';

describe('ServiceNow values', () => {
  it('reads display values as trimmed text, treating blanks and "null" as no value', () => {
    expect(text('  Core banking ')).toBe('Core banking');
    expect(text('')).toBeNull();
    expect(text('   ')).toBeNull();
    expect(text('null')).toBeNull();
    expect(text(null)).toBeNull();
    expect(text(undefined)).toBeNull();
    expect(text(42)).toBe('42');
    expect(text(false)).toBe('false');
    expect(text({ link: 'x' })).toBe('{"link":"x"}'); // never "[object Object]"
  });

  it('reads amounts as 2-decimal strings and ignores anything that is not a number', () => {
    expect(decimal('470.24')).toBe('470.24');
    expect(decimal('10')).toBe('10.00');
    expect(decimal('1,234.5')).toBe('1234.50');
    expect(decimal(-3)).toBe('-3.00');
    expect(decimal('Synthetic description 043')).toBeNull();
    expect(decimal('RM0.00')).toBeNull();
    expect(decimal('')).toBeNull();
    expect(decimal('12345678901234')).toBeNull(); // beyond 13 whole digits
  });

  it('reads ServiceNow booleans', () => {
    expect(isTrue('true')).toBe(true);
    expect(isTrue(true)).toBe(true);
    expect(isTrue('false')).toBe(false);
    expect(isTrue('')).toBe(false);
    expect(isTrue(null)).toBe(false);
  });

  it('hashes content independently of key order', () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: null }] })).toBe('{"a":[{"c":null,"d":2}],"b":1}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
    expect(contentHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
