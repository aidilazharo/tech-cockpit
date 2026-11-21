/** Full-page reload (replaceable in tests: jsdom cannot reload). */
export const pageReload = {
  reload: () => window.location.reload(),
}

const RELOADED_AT = 'tc:reloaded-for-update'
const LOOP_GUARD_MS = 10_000

// Chrome/Edge, Firefox and Safari word a failed `import()` differently.
const CHUNK_LOAD_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i

/** The page's code could not be downloaded: a new release replaced the files, or the server is unreachable. */
export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_ERROR.test(error.message)
}

/**
 * Reloads once so the browser picks up a new release. Returns false (and does nothing)
 * when it reloaded moments ago, or cannot remember that it did, so it never loops.
 */
export function reloadOnceForUpdate(now = Date.now()): boolean {
  try {
    if (now - (Number(sessionStorage.getItem(RELOADED_AT)) || 0) < LOOP_GUARD_MS) return false
    sessionStorage.setItem(RELOADED_AT, String(now))
  } catch {
    return false
  }
  pageReload.reload()
  return true
}
