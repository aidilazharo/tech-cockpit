import type { Envelope, SectionAnswers } from './answers.js';
import { emptyContent, SLOT_OWNER, VIEW_EDITORS, viewAnswered, type DiagramContent, type DiagramSlot } from './diagrams.js';
import { plainText, type RichDoc } from './rich-text.js';
import type { SadSectionKey } from './sections.js';
import { type Condition, type Group, isQuestion, type Question, type SadTemplate, type TableColumn, type TableQuestion, type TrmSource } from './template-types.js';

export type SadAnswers = Partial<Record<SadSectionKey, SectionAnswers>>;
/** Each slot's content; a slot nobody has drawn in yet is empty. */
export type SadDiagrams = Partial<Record<DiagramSlot, DiagramContent>>;
/** TRM values by source; null, '' or [] means TRM does not hold it. */
export type TrmValues = Partial<Record<TrmSource, unknown>>;

export interface SectionCompletion {
  section: SadSectionKey;
  /** Questions shown */
  total: number;
  answered: number;
  /** Keys of shown questions still to answer, in template order; a diagram slot is "diagram:<slot>", another view of it "diagram:<slot>:<view>" */
  missing: string[];
}

export interface Evaluation {
  /** Questions hidden by their conditions (or their group's) */
  hidden: Set<string>;
  sections: SectionCompletion[];
}

interface Located {
  question: Question;
  group: Group;
  section: SadSectionKey;
}

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
const hasTrmValue = (value: unknown) => value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '') && !(Array.isArray(value) && value.length === 0);

/** The selected values a condition can test: choice, multiple choice or yes/no. Null when not answered. */
function selectedValues(envelope: Envelope | undefined): string[] | null {
  if (!envelope || !('value' in envelope)) return null;
  const value = envelope.value as { selected?: string | string[]; answer?: string };
  if (typeof value?.answer === 'string') return [value.answer];
  if (Array.isArray(value?.selected)) return value.selected;
  if (typeof value?.selected === 'string') return [value.selected];
  return null;
}

const filledCell = (column: TableColumn, cell: unknown): boolean => {
  if (cell === undefined || cell === null || (typeof cell === 'string' && cell.trim() === '')) return false;
  // Data connected to an API: at least one row, each with its data object and key attributes.
  if (column.type === 'dataObjects') return (cell as { object: string; attributes: string }[]).length > 0 && (cell as { object: string; attributes: string }[]).every((row) => !blank(row.object) && !blank(row.attributes));
  return true;
};

function tableAnswered(question: TableQuestion, rows: { row?: string; cells: Record<string, unknown> }[]): boolean {
  const required = question.columns.filter((column) => !column.optional);
  const columnOf = (key: string) => question.columns.find((column) => column.key === key)!;
  const complete = (row: (typeof rows)[number]) =>
    required.every((column) => filledCell(column, row.cells[column.key])) && (question.oneOf ?? []).every((keys) => keys.some((key) => filledCell(columnOf(key), row.cells[key])));
  if (!rows.every(complete)) return false;
  if (question.fixedRows) return question.fixedRows.every((label) => rows.some((row) => row.row === label));
  return rows.length > 0;
}

function answered(question: Question, envelope: Envelope | undefined, trm: TrmValues): boolean {
  if (question.type === 'trm') {
    if (question.fallback?.type === 'none' || hasTrmValue(trm[question.source])) return true;
  }
  if (!envelope) return false;
  if ('notApplicable' in envelope) return !blank(envelope.reason);
  const value = envelope.value as never;
  switch (question.type) {
    case 'text':
      return plainText(value as RichDoc).trim() !== '';
    case 'short':
      return !blank(value);
    case 'number':
    case 'date':
      return value !== null && value !== undefined;
    case 'yesno':
      return typeof (value as { answer?: string }).answer === 'string';
    case 'choice':
    case 'multi': {
      const { selected, other } = value as { selected: string | string[]; other?: string };
      const picked = Array.isArray(selected) ? selected : [selected];
      return picked.length > 0 && (!picked.includes('other') || !blank(other));
    }
    case 'links':
      return (value as unknown[]).length > 0;
    case 'table':
      return tableAnswered(question, value);
    case 'retention':
      return (value as { rows: { resourceName: string }[] }).rows.some((row) => !blank(row.resourceName));
    case 'trm': {
      const fallback = value as string | { selected: string };
      return typeof fallback === 'string' ? !blank(fallback) : typeof fallback?.selected === 'string';
    }
  }
}

/**
 * Which questions show (conditions follow chains: a question depending on a hidden one hides too) and how complete
 * each section is. A diagram view counts in the section that edits it (unless its group is hidden): the drawing view
 * and, for the solution diagram, section 9's data flow facts.
 */
export function evaluate(template: SadTemplate, answers: SadAnswers, trm: TrmValues, diagrams: SadDiagrams = {}): Evaluation {
  const located = new Map<string, Located>();
  for (const section of template.sections) {
    for (const group of section.groups) {
      for (const item of group.items) if (isQuestion(item)) located.set(item.key, { question: item, group, section: section.key });
    }
  }
  // Only asked about questions isShown found in the template.
  const envelopeOf = (key: string) => answers[located.get(key)!.section]?.[key];

  const shown = new Map<string, boolean>();
  const matches = (condition: Condition): boolean => {
    if (!isShown(condition.question)) return false;
    const picked = selectedValues(envelopeOf(condition.question));
    if (!picked) return false;
    if (condition.anyOf) return picked.some((value) => condition.anyOf!.includes(value));
    return picked.some((value) => !condition.anyExcept!.includes(value));
  };
  function isShown(key: string): boolean {
    const known = shown.get(key);
    if (known !== undefined) return known;
    const where = located.get(key);
    const conditions = where ? [where.group.showWhen, where.question.showWhen].filter((c): c is Condition => c !== undefined) : [];
    const result = where !== undefined && conditions.every(matches);
    shown.set(key, result);
    return result;
  }

  const hidden = new Set<string>();
  // The API inventory's rows, which integration connections link to.
  const inventory = answers['api-inventory']?.apis;
  const apis = new Set(inventory && 'value' in inventory ? (inventory.value as { id?: string }[]).flatMap((row) => (row.id ? [row.id] : [])) : []);
  const sections = template.sections.map((section): SectionCompletion => {
    let total = 0;
    const missing: string[] = [];
    for (const { question } of [...located.values()].filter((entry) => entry.section === section.key)) {
      if (!isShown(question.key)) {
        hidden.add(question.key);
        continue;
      }
      total += 1;
      if (!answered(question, envelopeOf(question.key), trm)) missing.push(question.key);
    }
    for (const group of section.groups) {
      if (group.showWhen && !matches(group.showWhen)) continue;
      for (const { slot, view } of group.diagrams ?? []) {
        if (VIEW_EDITORS[view] !== section.key) continue;
        total += 1;
        if (!viewAnswered(slot, view, diagrams[slot] ?? emptyContent(slot), apis)) missing.push(view === SLOT_OWNER[slot].view ? `diagram:${slot}` : `diagram:${slot}:${view}`);
      }
    }
    return { section: section.key, total, answered: total - missing.length, missing };
  });
  return { hidden, sections };
}
