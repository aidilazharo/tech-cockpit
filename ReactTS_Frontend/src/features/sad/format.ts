import type { Option, SadSectionKey, SectionAnswers, TrmData, TrmSource, Version } from './schemas'

/** Links in answers may only open web pages or email. */
export const SAFE_URL = /^(https?:\/\/|mailto:)[^\s<>"']+$/i

/** An option's label (or "Other: …" for the free-text choice). */
export function optionLabel(options: Option[] | undefined, value: string, other?: string, otherLabel = 'Other'): string {
  if (value === 'other') return other ? `${otherLabel}: ${other}` : otherLabel
  return options?.find((option) => option.value === value)?.label ?? value
}

export interface RichMark {
  type: string
  attrs?: { href?: string; fontSize?: string }
}
export interface RichNode {
  type: string
  text?: string
  marks?: RichMark[]
  attrs?: { start?: number; level?: number }
  content?: RichNode[]
}

/** An input's text for an answer ('' when unanswered). */
export const inputText = (value: unknown): string => (typeof value === 'string' ? value : '')
/** An answer from a text input: emptied means unanswered. */
export const fromInput = (text: string): string | undefined => (text === '' ? undefined : text)
/** An answer from a number input: emptied (or not a number) means unanswered. */
export const fromNumberInput = (text: string): number | undefined => (text === '' || Number.isNaN(Number(text)) ? undefined : Number(text))
/** A date picker's value from an answer. */
export const dateValue = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** A section's answers in a version (none for a section the reader cannot view). */
export function sectionAnswers(version: Pick<Version, 'sections'>, key: SadSectionKey): SectionAnswers {
  return version.sections.find((section) => section.key === key)?.answers ?? {}
}

/** How many shown questions of a section are still to answer. */
export function questionsLeft(version: Pick<Version, 'completion'>, key: SadSectionKey): number {
  const completion = version.completion.find((c) => c.section === key)
  return completion ? completion.total - completion.answered : 0
}

/** An application as people know it: its name, else its APM ID. */
export function appName(application: { name: string | null; number: string | null }): string {
  return application.name ?? application.number ?? ''
}

/** A plain TRM value as text, or null when TRM holds nothing (or the caller may not see it). */
export function trmText(trm: TrmData | null, source: TrmSource): string | null {
  const value = trm && !trm.restricted.includes(source) ? trm.values[source] : null
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : null
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** The words of a rich-text answer (empty when there are none). */
export function richPlainText(doc: unknown): string {
  const walk = (node: RichNode): string => (node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(walk).join(node.type === 'doc' ? '\n' : ' '))
  return doc && typeof doc === 'object' ? walk(doc as RichNode).trim() : ''
}
