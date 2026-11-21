// Printable ASCII only, starting with one "/" (not "//" or "/\", which browsers treat
// as another host). Mirrors the backend's returnTo rule.
const SAFE_PATH = /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]*$/
const MAX_LENGTH = 2048

/** An in-app path to return to, or null when the value could lead off-site. */
export function safePath(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length <= MAX_LENGTH && SAFE_PATH.test(value) ? value : null
}
