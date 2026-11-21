import { describe, expect, it } from 'vitest'
import {
  endOfDayMy,
  fromCalendarDate,
  isValidIsoDate,
  lastDayMy,
  maskDisplayDate,
  parseDisplayDate,
  startOfDayMy,
  toCalendarDate,
  toDisplayDate,
  todayMy,
} from './dates'

describe('Malaysia calendar dates', () => {
  it('knows today in Malaysia, whatever the device time zone', () => {
    // 17:00 UTC is 01:00 the next day in Kuala Lumpur.
    expect(todayMy(new Date('2026-10-21T17:00:00Z'))).toBe('2026-10-22')
  })

  it('turns a day into its start and its exclusive end in Malaysia time', () => {
    expect(startOfDayMy('2026-12-31')).toBe('2026-12-30T16:00:00.000Z')
    expect(endOfDayMy('2026-12-31')).toBe('2026-12-31T16:00:00.000Z')
    expect(lastDayMy(endOfDayMy('2026-12-31'))).toBe('2026-12-31')
  })

  it('validates real dates only', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('21/10/2026')).toBe(false)
  })

  it.each([
    ['21/10/2026', '2026-10-21'],
    ['21102026', '2026-10-21'],
    ['21-10-2026', '2026-10-21'],
    [' 21 10 2026 ', '2026-10-21'],
    ['31/02/2026', null],
    ['21/10/26', null],
    ['', null],
  ])('reads %j as %j', (text, expected) => {
    expect(parseDisplayDate(text)).toBe(expected)
  })

  it('masks digits into DD/MM/YYYY as they are typed', () => {
    expect(maskDisplayDate('2')).toBe('2')
    expect(maskDisplayDate('211')).toBe('21/1')
    expect(maskDisplayDate('21102026999')).toBe('21/10/2026')
    expect(maskDisplayDate('21/10/2026')).toBe('21/10/2026')
  })

  it('converts between display, calendar and ISO forms', () => {
    expect(toDisplayDate('2026-10-21')).toBe('21/10/2026')
    expect(fromCalendarDate(toCalendarDate('2026-01-05'))).toBe('2026-01-05')
  })
})
