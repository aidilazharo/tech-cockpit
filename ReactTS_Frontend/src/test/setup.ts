import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '../i18n'

// Routes load lazily, so a test's first findBy… includes compiling the page; the 1 s default is too short on the Windows laptop.
configure({ asyncUtilTimeout: 5000 })

// jsdom lacks browser APIs that Base UI's positioning and theme detection use.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

Element.prototype.scrollIntoView ??= function scrollIntoView() {}

// The rich text editor (ProseMirror) measures text ranges to keep the cursor in view; jsdom has no layout.
Range.prototype.getClientRects ??= function getClientRects() {
  return Object.assign([], { item: () => null }) as unknown as DOMRectList
}
Range.prototype.getBoundingClientRect ??= function getBoundingClientRect() {
  return new DOMRect()
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
