import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests: a state-changing request must come
 * from one of our own origins. Browsers always send Origin on such requests, so a
 * missing Origin is refused too.
 */
export function isTrustedOrigin(req: Request, trustedOrigins: readonly string[]): boolean {
  if (SAFE_METHODS.has(req.method)) {
    return true;
  }
  const origin = req.headers.origin;
  return typeof origin === 'string' && trustedOrigins.includes(origin);
}
