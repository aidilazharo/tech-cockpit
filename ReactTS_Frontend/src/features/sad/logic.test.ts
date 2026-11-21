import { describe, expect, it } from 'vitest'
import { template } from './fixtures'
import { hiddenQuestions, retiredQuestions, selectedValues, warningOf } from './logic'
import type { SectionAnswers, Template } from './schemas'

describe('hiddenQuestions', () => {
  it('shows a question once the answer it depends on matches, following chains', () => {
    const solution = (answers: SectionAnswers) => ({ 'solution-integration': answers, 'security-design': {} })
    expect([...hiddenQuestions(template, solution({}), [])].sort()).toEqual(['api-auth', 'apis', 'internet-protection', 'vm-check-in'])
    expect(hiddenQuestions(template, solution({ 'hosting-location': { value: { selected: ['aia-azure'] } } }), []).has('vm-check-in')).toBe(false)
    expect(hiddenQuestions(template, solution({ accessibility: { value: { selected: ['internal', 'internet'] } } }), []).has('internet-protection')).toBe(false)
    expect(hiddenQuestions(template, solution({ accessibility: { notApplicable: true, reason: 'x' } }), []).has('internet-protection')).toBe(true)
    expect(hiddenQuestions(template, { ...solution({}), 'security-design': { 'uses-apis': { value: { answer: 'yes' } } } }, []).has('api-auth')).toBe(false)
  })

  it('trusts the server when the answers a condition depends on are in a section the caller cannot view', () => {
    // Only the API inventory is known: whether "uses-apis" is yes comes from the server.
    expect(hiddenQuestions(template, { 'api-inventory': {} }, ['apis']).has('apis')).toBe(true)
    expect(hiddenQuestions(template, { 'api-inventory': {} }, []).has('apis')).toBe(false)
  })

  it('handles "anything but" conditions and conditions on questions the template does not have', () => {
    const small: Template = {
      version: 1,
      sections: [
        {
          key: 'security-design',
          title: 'S',
          references: [],
          groups: [
            {
              key: 'g',
              items: [
                { type: 'multi', key: 'access', label: 'Access', options: [{ value: 'vpn', label: 'VPN' }, { value: 'none', label: 'None' }] },
                { type: 'short', key: 'envs', label: 'Envs', showWhen: { question: 'access', anyExcept: ['none'] } },
                { type: 'short', key: 'orphan', label: 'Orphan', showWhen: { question: 'missing' } },
              ],
            },
          ],
        },
      ],
    }
    const hidden = (selected: string[]) => hiddenQuestions(small, { 'security-design': { access: { value: { selected } } } }, ['orphan'])
    expect(hidden(['none']).has('envs')).toBe(true)
    expect(hidden(['none', 'vpn']).has('envs')).toBe(false)
    expect(hidden(['vpn']).has('orphan')).toBe(true) // unknown: the server said hidden
    expect(hiddenQuestions(small, { 'security-design': {} }, []).has('orphan')).toBe(false)
    // A condition without values only needs an answer.
    expect(hiddenQuestions({ ...small, sections: [{ ...small.sections[0], groups: [{ key: 'g', items: [small.sections[0].groups[0].items[0], { type: 'short', key: 'x', label: 'X', showWhen: { question: 'access' } }] }] }] }, { 'security-design': { access: { value: { selected: ['vpn'] } } } }, []).has('x')).toBe(false)
  })

  it('reads the values a condition can test', () => {
    expect(selectedValues({ value: { answer: 'no' } })).toEqual(['no'])
    expect(selectedValues({ value: { selected: 'a' } })).toEqual(['a'])
    expect(selectedValues({ value: 'text' })).toBeNull()
    expect(selectedValues({ notApplicable: true, reason: 'x' })).toBeNull()
    expect(selectedValues(undefined)).toBeNull()
  })
})

describe('warningOf', () => {
  const question = template.sections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((item) => item.key === 'api-refresh-token')!
  const answers = (timeout: SectionAnswers[string] | undefined, refresh: SectionAnswers[string] | undefined): SectionAnswers => ({
    ...(timeout ? { 'api-session-timeout': timeout } : {}),
    ...(refresh ? { 'api-refresh-token': refresh } : {}),
  })
  const NO = { value: { answer: 'no' } }

  it('warns when every test holds: a timeout over the limit and no refresh token', () => {
    expect(warningOf(question as never, answers({ value: 30 }, NO))).toBe('The API session timeout is more than 15 minutes: there should be an API refresh token along with the access token.')
  })

  it.each([
    ['the timeout is at the limit', answers({ value: 15 }, NO)],
    ['there is a refresh token', answers({ value: 30 }, { value: { answer: 'yes' } })],
    ['the timeout is not answered', answers(undefined, NO)],
    ['the timeout does not apply', answers({ notApplicable: true, reason: 'No sessions' }, NO)],
    ['the refresh token is not answered', answers({ value: 30 }, undefined)],
  ])('does not warn when %s', (_, given) => {
    expect(warningOf(question as never, given)).toBeNull()
  })

  it('never warns for a question without a warning', () => {
    const other = template.sections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((item) => item.key === 'uses-apis')!
    expect(warningOf(other as never, answers({ value: 30 }, NO))).toBeNull()
  })
})

describe('retiredQuestions', () => {
  it('gives the removed questions a version answered, as questions of their kind (numbers with their unit)', () => {
    const section = {
      ...template.sections[0],
      retired: [
        { key: 'a', label: 'A', type: 'text' as const, removedIn: 2 },
        { key: 'b', label: 'B', type: 'yesno' as const, removedIn: 3 },
        { key: 'c', label: 'C', type: 'number' as const, removedIn: 3, unit: 'minutes' },
        { key: 'd', label: 'D', type: 'text' as const, removedIn: 3 },
      ],
    }
    expect(retiredQuestions(section, { a: { value: 'x' }, c: { value: 30 } }, { b: { value: { answer: 'no' } } })).toEqual([
      { type: 'text', key: 'a', label: 'A' },
      { type: 'yesno', key: 'b', label: 'B' },
      { type: 'number', key: 'c', label: 'C', unit: 'minutes' },
    ])
    expect(retiredQuestions(template.sections[1], {})).toEqual([])
  })
})
