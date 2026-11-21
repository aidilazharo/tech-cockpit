import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { isTrustedOrigin } from './origin-check.js';

const trusted = ['http://localhost:5173', 'http://localhost:3000'];
const request = (method: string, origin?: string) => ({ method, headers: origin ? { origin } : {} }) as Request;

describe('isTrustedOrigin', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('allows the safe method %s from anywhere', (method) => {
    expect(isTrustedOrigin(request(method, 'https://evil.example.com'), trusted)).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('allows %s from a trusted origin', (method) => {
    expect(isTrustedOrigin(request(method, 'http://localhost:5173'), trusted)).toBe(true);
  });

  it.each([
    ['another site', 'https://evil.example.com'],
    ['a look-alike origin', 'http://localhost:5173.evil.example.com'],
    ['the opaque "null" origin', 'null'],
    ['no Origin header', undefined],
  ])('refuses a POST from %s', (_label, origin) => {
    expect(isTrustedOrigin(request('POST', origin), trusted)).toBe(false);
  });
});
