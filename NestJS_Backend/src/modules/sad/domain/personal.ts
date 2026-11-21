import type { SectionAnswers } from './answers.js';
import { isQuestion, type Section, type TableQuestion } from './template-types.js';

interface Row {
  id?: string;
  row?: string;
  cells: Record<string, unknown>;
}

/**
 * Which names are hidden from the caller. Personal questions are the application's people
 * (field class sad.application-people); person columns are API owners (sad.api-people).
 */
export interface HiddenNames {
  questions: boolean;
  columns: boolean;
}

function personalParts(section: Section, hidden: HiddenNames) {
  const questions = new Set<string>();
  const columns = new Map<string, string[]>();
  for (const item of section.groups.flatMap((group) => group.items)) {
    if (!isQuestion(item)) continue;
    if (item.personal && hidden.questions) questions.add(item.key);
    if (item.type === 'table' && hidden.columns) {
      const personal = (item as TableQuestion).columns.filter((column) => column.personal).map((column) => column.key);
      if (personal.length > 0) columns.set(item.key, personal);
    }
  }
  return { questions, columns };
}

const rowsOf = (envelope: SectionAnswers[string] | undefined): Row[] | null =>
  envelope && 'value' in envelope && Array.isArray(envelope.value) ? (envelope.value as Row[]) : null;

/** A copy without people's names: personal questions are left out, person cells removed. */
export function maskPersonal(section: Section, answers: SectionAnswers, hidden: HiddenNames): SectionAnswers {
  const { questions, columns } = personalParts(section, hidden);
  const copy: SectionAnswers = {};
  for (const [key, envelope] of Object.entries(answers)) {
    if (questions.has(key)) continue;
    const rows = rowsOf(envelope);
    const hide = columns.get(key);
    copy[key] = rows && hide ? { value: rows.map((row) => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).filter(([cell]) => !hide.includes(cell))) })) } : envelope;
  }
  return copy;
}

/**
 * For a saver who may not see names: names come from what is stored, never from the request.
 * Personal questions keep their stored answer; person cells come from the stored row with the same id.
 */
export function keepPersonal(section: Section, saved: SectionAnswers, stored: SectionAnswers, hidden: HiddenNames): SectionAnswers {
  const { questions, columns } = personalParts(section, hidden);
  const result: SectionAnswers = {};
  for (const [key, envelope] of Object.entries(saved)) {
    if (questions.has(key)) continue;
    const rows = rowsOf(envelope);
    const personal = columns.get(key);
    if (!rows || !personal) {
      result[key] = envelope;
      continue;
    }
    const before = new Map((rowsOf(stored[key]) ?? []).map((row) => [row.id, row]));
    result[key] = {
      value: rows.map((row) => {
        const cells = Object.fromEntries(Object.entries(row.cells).filter(([cell]) => !personal.includes(cell)));
        const previous = row.id ? before.get(row.id) : undefined;
        for (const cell of personal) if (previous?.cells[cell] !== undefined) cells[cell] = previous.cells[cell];
        return { ...row, cells };
      }),
    };
  }
  for (const key of questions) if (stored[key]) result[key] = stored[key];
  return result;
}
