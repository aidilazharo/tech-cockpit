const MAX_LENGTH = 2048;
// Printable ASCII only: no control characters (header injection), no spaces or backslashes
// (browsers treat "\" like "/", so "/\evil.com" would leave the app).
const SAFE_PATH = /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]*$/;

/** A same-app path to return to after sign-in, or "/" when the value is unsafe or missing. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_LENGTH || !SAFE_PATH.test(value)) {
    return '/';
  }
  return value;
}

/** Absolute URL in the web app; whatever the input, the result stays on the app origin. */
export function appUrl(appBaseUrl: string, returnTo: string): string {
  const url = new URL(safeReturnTo(returnTo), appBaseUrl);
  return url.origin === appBaseUrl ? url.href : `${appBaseUrl}/`;
}
