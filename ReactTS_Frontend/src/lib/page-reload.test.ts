import { afterEach, describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, pageReload, reloadOnceForUpdate } from './page-reload'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('failed page downloads', () => {
  it('recognises a page whose code could not be downloaded, in every browser', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: http://x/src/A.tsx'))).toBe(true) // Chrome, Edge
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: http://x/src/A.tsx'))).toBe(true) // Firefox
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true) // Safari
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })

  it('reloads once to pick up a new release, but never in a loop', () => {
    const reload = vi.spyOn(pageReload, 'reload').mockImplementation(() => undefined)
    expect(reloadOnceForUpdate(100_000)).toBe(true)
    expect(reloadOnceForUpdate(105_000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadOnceForUpdate(111_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload by itself when the browser will not let it remember the reload', () => {
    const reload = vi.spyOn(pageReload, 'reload').mockImplementation(() => undefined)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(reloadOnceForUpdate()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
