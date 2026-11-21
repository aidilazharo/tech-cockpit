import type { Answer, Condition, Group, Question, SadSectionKey, SectionAnswers, Template, TemplateSection } from './schemas'

export interface Located {
  question: Question
  group: Group
  section: SadSectionKey
}

export type KnownAnswers = Partial<Record<SadSectionKey, SectionAnswers>>

/** Every question of the template by key. */
export function locate(template: Template): Map<string, Located> {
  const located = new Map<string, Located>()
  for (const section of template.sections) {
    for (const group of section.groups) {
      for (const item of group.items) if (item.type !== 'note') located.set(item.key, { question: item, group, section: section.key })
    }
  }
  return located
}

/** The values a condition tests: choice, multiple choice or yes/no. Null when unanswered or not applicable. */
export function selectedValues(answer: Answer | undefined): string[] | null {
  if (!answer || !('value' in answer)) return null
  const value = answer.value as { selected?: string | string[]; answer?: string } | undefined
  if (typeof value?.answer === 'string') return [value.answer]
  if (Array.isArray(value?.selected)) return value.selected
  if (typeof value?.selected === 'string') return [value.selected]
  return null
}

/**
 * Questions hidden by their conditions. Evaluated here (so editing shows and hides questions
 * at once) when the answers a condition depends on are known; otherwise the server's answer
 * stands (the caller may not view the section holding them).
 */
export function hiddenQuestions(template: Template, answers: KnownAnswers, serverHidden: readonly string[]): Set<string> {
  const located = locate(template)
  const fromServer = new Set(serverHidden)
  const shown = new Map<string, boolean>()

  const matches = (condition: Condition): boolean => {
    if (!isShown(condition.question)) return false
    const where = located.get(condition.question)!
    const picked = selectedValues(answers[where.section]?.[condition.question])
    if (!picked) return false
    if (condition.anyOf) return picked.some((value) => condition.anyOf!.includes(value))
    return picked.some((value) => !(condition.anyExcept ?? []).includes(value))
  }

  function isShown(key: string): boolean {
    const known = shown.get(key)
    if (known !== undefined) return known
    const where = located.get(key)!
    const conditions = [where.group.showWhen, where.question.showWhen].filter((c): c is Condition => c !== undefined)
    const unknown = conditions.some((condition) => {
      const controller = located.get(condition.question)
      return !controller || answers[controller.section] === undefined
    })
    const result = unknown ? !fromServer.has(key) : conditions.every(matches)
    shown.set(key, result)
    return result
  }

  return new Set([...located.keys()].filter((key) => !isShown(key)))
}

/** The question's warning when every test holds on its section's answers, else null (advice: the answer stays valid). */
export function warningOf(question: Question, answers: SectionAnswers): string | null {
  const warning = question.warning
  if (!warning) return null
  const holds = warning.when.every((test) => {
    const answer = answers[test.question]
    if (test.over !== undefined) return answer !== undefined && 'value' in answer && typeof answer.value === 'number' && answer.value > test.over
    return (selectedValues(answer) ?? []).some((value) => test.anyOf!.includes(value))
  })
  return holds ? warning.text : null
}

/** Questions later templates removed whose answers a version keeps (the API sends them for approved versions only), as questions of their kind. */
export function retiredQuestions(section: TemplateSection, ...answers: (SectionAnswers | null | undefined)[]): Question[] {
  return (section.retired ?? [])
    .filter((question) => answers.some((given) => given?.[question.key] !== undefined))
    .map(({ type, key, label, unit }): Question => (type === 'number' ? { type, key, label, unit } : { type, key, label }))
}
