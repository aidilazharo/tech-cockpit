import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { signInWith } from '../test/harness'
import { navigation, useAuthStore } from './auth-store'
import { useCan } from './permissions'

describe('useCan', () => {
  it('answers from the signed-in user permissions', () => {
    signInWith(['access:user:read'])
    const { result } = renderHook(() => useCan())

    expect(result.current('access:user:read')).toBe(true)
    expect(result.current('access:user:manage')).toBe(false)
  })

  it('allows nothing when nobody is signed in', () => {
    useAuthStore.setState({ status: 'signed-out', me: null })
    const { result } = renderHook(() => useCan())

    expect(result.current('access:user:read')).toBe(false)
  })
})

describe('navigation.assign', () => {
  it('navigates the browser', () => {
    navigation.assign('#signed-in')

    expect(window.location.hash).toBe('#signed-in')
    window.location.hash = ''
  })
})
