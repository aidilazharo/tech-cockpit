import { describe, expect, it } from 'vitest'
import { appName, dateValue, fromInput, fromNumberInput, inputText, optionLabel, questionsLeft, richPlainText, SAFE_URL, sectionAnswers, trmText } from './format'

const trm = (values: Record<string, unknown>, restricted: string[] = []) => ({ values, restricted, live: true }) as never

describe('SAD formatting', () => {
  it('names options, "other" answers and unknown values', () => {
    const options = [{ value: 'aia-azure', label: 'AIA Azure' }]
    expect(optionLabel(options, 'aia-azure')).toBe('AIA Azure')
    expect(optionLabel(options, 'other', 'Colo')).toBe('Other: Colo')
    expect(optionLabel(options, 'other')).toBe('Other')
    expect(optionLabel(undefined, 'gone')).toBe('gone')
  })

  it('reads TRM values as text, or nothing when absent, empty or restricted', () => {
    expect(trmText(trm({ portfolios: ['Group', 'Retail'] }), 'portfolios')).toBe('Group, Retail')
    expect(trmText(trm({ portfolios: [] }), 'portfolios')).toBeNull()
    expect(trmText(trm({ name: ' ' }), 'name')).toBeNull()
    expect(trmText(trm({ businessOwner: 'Bob' }, ['businessOwner']), 'businessOwner')).toBeNull()
    expect(trmText(null, 'name')).toBeNull()
  })

  it('turns inputs into answers: emptied means unanswered', () => {
    expect([inputText('a'), inputText(undefined), inputText(3)]).toEqual(['a', '', ''])
    expect([fromInput('a'), fromInput('')]).toEqual(['a', undefined])
    expect([fromNumberInput('12'), fromNumberInput(''), fromNumberInput('e')]).toEqual([12, undefined, undefined])
    expect([dateValue('2026-10-01'), dateValue(undefined)]).toEqual(['2026-10-01', null])
  })

  it("reads a section's answers and what is left to answer", () => {
    const version = { sections: [{ key: 'network' as const, readable: false, editable: false, rowVersion: 0, answers: null }], completion: [{ section: 'network' as const, total: 3, answered: 1, missing: ['a', 'b'] }] }
    expect(sectionAnswers(version, 'network')).toEqual({})
    expect(sectionAnswers(version, 'backup')).toEqual({})
    expect(questionsLeft(version, 'network')).toBe(2)
    expect(questionsLeft(version, 'backup')).toBe(0)
  })

  it('takes the words of rich text, and names applications', () => {
    expect(richPlainText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }, { type: 'text' }] }, { type: 'paragraph' }] })).toBe('Hi')
    expect(richPlainText(null)).toBe('')
    expect(appName({ name: null, number: 'APM-1' })).toBe('APM-1')
    expect(appName({ name: null, number: null })).toBe('')
    expect(SAFE_URL.test('mailto:a@aia.com')).toBe(true)
    expect(SAFE_URL.test('javascript:x')).toBe(false)
  })
})
