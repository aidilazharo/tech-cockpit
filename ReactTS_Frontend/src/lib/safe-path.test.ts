import { describe, expect, it } from 'vitest'
import { safePath } from './safe-path'

describe('safePath', () => {
  it.each(['/', '/trm', '/approvals?tab=mine#top'])('keeps the in-app path %s', (path) => {
    expect(safePath(path)).toBe(path)
  })

  it.each([
    ['missing', null],
    ['undefined', undefined],
    ['empty', ''],
    ['absolute URL', 'https://evil.example.com'],
    ['protocol-relative', '//evil.example.com'],
    ['backslash', '/\\evil.example.com'],
    ['space', '/a b'],
    ['too long', `/${'a'.repeat(2048)}`],
  ])('refuses %s', (_label, value) => {
    expect(safePath(value)).toBeNull()
  })
})
