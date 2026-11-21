import { describe, expect, it } from 'vitest';
import { appUrl, safeReturnTo } from './return-to.js';

describe('safeReturnTo', () => {
  it.each([
    ['/', '/'],
    ['/trm/landscape', '/trm/landscape'],
    ['/approvals?tab=mine#top', '/approvals?tab=mine#top'],
  ])('keeps the in-app path %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });

  it.each([
    ['missing', undefined],
    ['not a string', ['/a', '/b']],
    ['empty', ''],
    ['absolute URL', 'https://evil.example.com/'],
    ['protocol-relative URL', '//evil.example.com'],
    ['backslash trick', '/\\evil.example.com'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path without slash', 'trm'],
    ['control character', '/trm\r\nSet-Cookie: x=1'],
    ['tab character', '/\t/evil.example.com'],
    ['too long', `/${'a'.repeat(2048)}`],
  ])('falls back to / for %s', (_label, input) => {
    expect(safeReturnTo(input)).toBe('/');
  });
});

describe('appUrl', () => {
  it('joins the app origin and a safe path', () => {
    expect(appUrl('http://localhost:5173', '/trm?x=1')).toBe('http://localhost:5173/trm?x=1');
  });

  it('never leaves the app origin', () => {
    expect(appUrl('http://localhost:5173', '//evil.example.com')).toBe('http://localhost:5173/');
  });

  it('falls back to the app home when the configured base URL is not a bare origin', () => {
    expect(appUrl('http://LocalHost:5173', '/trm')).toBe('http://LocalHost:5173/');
  });
});
