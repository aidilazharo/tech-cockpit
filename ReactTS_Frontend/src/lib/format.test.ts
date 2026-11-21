import { describe, expect, it } from 'vitest'
import { formatAmount, formatDate, formatDateTime, formatMyr } from './format'

describe('formatMyr', () => {
  it.each([
    ['249999.99', 'RM 249,999.99'],
    ['250000', 'RM 250,000.00'],
    [1000000, 'RM 1,000,000.00'],
    ['0', 'RM 0.00'],
    ['-1500.5', '-RM 1,500.50'],
  ])('formats %s as %s', (input, expected) => {
    // Intl may use a non-breaking space between symbol and amount
    expect(formatMyr(input)?.replace(/\u00a0/g, ' ')).toBe(expected)
  })

  it('returns null for restricted (null) values so the UI can show "Restricted"', () => {
    expect(formatMyr(null)).toBeNull()
    expect(formatMyr(undefined)).toBeNull()
  })

  it.each(['abc', '', '1,000', 'NaN'])('rejects a non-numeric amount %j', (input) => {
    expect(() => formatMyr(input)).toThrow(/Invalid amount/)
  })
})

describe('formatDate / formatDateTime', () => {
  it('shows Malaysia time whatever the device time zone', () => {
    // 16:30 UTC is 00:30 the next day in Kuala Lumpur.
    expect(formatDate('2026-10-21T16:30:00Z')).toBe('22 Oct 2026')
    expect(formatDateTime('2026-10-21T16:30:00Z')).toMatch(/^22 Oct 2026, 12:30\s?am$/i)
  })

  it('returns null for a missing date', () => {
    expect(formatDate(null)).toBeNull()
    expect(formatDateTime(undefined)).toBeNull()
  })
})

describe('formatAmount', () => {
  it('shows a plain amount with two decimals and thousands separators', () => {
    expect(formatAmount('136.2')).toBe('136.20')
    expect(formatAmount('1234567.891')).toBe('1,234,567.89')
    expect(formatAmount(null)).toBeNull()
    expect(() => formatAmount('ten')).toThrow('Invalid amount: ten')
  })
})
