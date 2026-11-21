import { z, type ZodType } from 'zod';
import { RichDocSchema, SAFE_URL } from './rich-text.js';
import { isQuestion, type Option, type Question, type Section, type TableColumn, type TableQuestion } from './template-types.js';

/**
 * Answers are stored per section as { [questionKey]: envelope }. An envelope holds a value, or says
 * the question does not apply (with a reason). Saving accepts partial answers (a draft is work in
 * progress); completeness is checked separately (visibility.ts) before submission.
 */
export type Envelope = { value: unknown } | { notApplicable: true; reason: string };
export type SectionAnswers = Record<string, Envelope>;

export const NotApplicableSchema = z.object({ notApplicable: z.literal(true), reason: z.string().trim().min(1, 'Say why it does not apply').max(1000) }).strict();

const shortText = (max = 500) => z.string().trim().max(max);
const values = (choices: Option[], other = false) => z.enum([...choices.map((option) => option.value), ...(other ? ['other'] : [])] as [string, ...string[]]);
const ref = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200) }).strict();
/** A person picked from TechCockpit users, or typed (2026-10-25). */
const personRef = z.union([ref, z.object({ name: z.string().trim().min(1).max(200) }).strict()]);
const dataObjects = z.array(z.object({ object: shortText(200), attributes: shortText(1000) }).strict()).max(50);

export const ChoiceValueSchema = (choices: Option[], other = false) => z.object({ selected: values(choices, other), other: shortText().optional() }).strict();
export const MultiValueSchema = (choices: Option[], other = false) =>
  z
    .object({ selected: z.array(values(choices, other)).max(choices.length + 1), other: shortText().optional() })
    .strict()
    .refine((value) => new Set(value.selected).size === value.selected.length, 'Each option once');
export const YesNoValueSchema = z.object({ answer: z.enum(['yes', 'no']), details: shortText(2000).optional() }).strict();
export const LinksValueSchema = z
  .array(z.object({ label: shortText(200).optional(), url: z.string().trim().max(2000).regex(SAFE_URL, 'Links must start with https://, http:// or mailto:') }).strict())
  .max(20);
export const RetentionValueSchema = z
  .object({
    rows: z
      .array(z.object({ standardId: z.uuid(), resourceName: shortText(300), comment: shortText(1000).optional() }).strict())
      .max(50)
      .refine((rows) => new Set(rows.map((row) => row.standardId)).size === rows.length, 'Each standard row once'),
  })
  .strict();

function cellSchema(column: TableColumn): ZodType {
  switch (column.type) {
    case 'text':
      return shortText(2000);
    case 'choice':
      return values(column.options ?? []);
    case 'yesno':
      return z.enum(['yes', 'no']);
    case 'number':
      return z.number().finite().min(0).max(1e12);
    case 'date':
      return z.iso.date();
    case 'person':
      return personRef;
    case 'dataObjects':
      return dataObjects;
    case 'applications':
      return z.object({ items: z.array(ref).max(50), other: shortText().optional() }).strict();
  }
}

function tableSchema(question: TableQuestion): ZodType {
  const cells = z.object(Object.fromEntries(question.columns.map((column) => [column.key, cellSchema(column).optional()]))).strict();
  const fixed = question.fixedRows ?? null;
  const row = z
    // Rows carry a stable id, so a save can keep values the saver may not see (people's names).
    .object({ id: z.uuid().optional(), row: shortText(200).optional(), cells })
    .strict()
    .superRefine((value, ctx) => {
      if (!fixed && value.row !== undefined) ctx.addIssue({ code: 'custom', message: 'This table has no row labels' });
      if (fixed && !value.row) ctx.addIssue({ code: 'custom', message: 'Each row needs its label' });
      if (fixed && value.row && !question.addRows && !fixed.includes(value.row)) ctx.addIssue({ code: 'custom', message: `Unknown row "${value.row}"` });
    });
  return z
    .array(row)
    .max(200)
    .refine((rows) => !fixed || new Set(rows.map((r) => r.row)).size === rows.length, 'Each row label once');
}

/** The value schema for a question, or null when it cannot be answered (a TRM value without a fallback). */
export function valueSchema(question: Question): ZodType | null {
  switch (question.type) {
    case 'text':
      return RichDocSchema;
    case 'short':
      return shortText();
    case 'choice':
      return ChoiceValueSchema(question.options, question.other);
    case 'multi':
      return MultiValueSchema(question.options, question.other);
    case 'yesno':
      return YesNoValueSchema;
    case 'number':
      return z.number().finite().min(0).max(1e12);
    case 'date':
      return z.iso.date();
    case 'links':
      return LinksValueSchema;
    case 'table':
      return tableSchema(question);
    case 'retention':
      return RetentionValueSchema;
    case 'trm':
      if (question.fallback?.type === 'none') return null;
      return question.fallback?.type === 'choice' ? ChoiceValueSchema(question.fallback.options) : shortText();
  }
}

/** Validates one section's answers: only its own questions, each a value of the right shape or "not applicable". */
export function sectionAnswersSchema(section: Section): ZodType<SectionAnswers> {
  const shape: Record<string, ZodType> = {};
  for (const item of section.groups.flatMap((group) => group.items)) {
    if (!isQuestion(item)) continue;
    const value = valueSchema(item);
    if (value) shape[item.key] = (item.allowNotApplicable === false ? z.object({ value }).strict() : z.union([z.object({ value }).strict(), NotApplicableSchema])).optional();
  }
  return z.object(shape).strict() as unknown as ZodType<SectionAnswers>;
}

const questionsOf = (section: Section) => new Map(section.groups.flatMap((group) => group.items.filter(isQuestion)).map((question) => [question.key, question]));

/**
 * The answers a version shows. An approved or superseded version keeps every answer it was approved with: to
 * questions later templates removed, and in the shape an older template asked for.
 */
export function shownAnswers(section: Section, answers: SectionAnswers, approved: boolean): SectionAnswers {
  if (!approved) return currentAnswers(section, answers);
  const kept = new Set([...questionsOf(section).keys(), ...(section.retired ?? []).map((question) => question.key)]);
  return Object.fromEntries(Object.entries(answers).filter(([key]) => kept.has(key)));
}

/**
 * Only the answers to questions this section still asks, in the shape it asks for now (the template drops questions
 * and changes their type between versions: such an answer is asked again).
 */
export function currentAnswers(section: Section, answers: SectionAnswers): SectionAnswers {
  const questions = questionsOf(section);
  return Object.fromEntries(
    Object.entries(answers).filter(([key, envelope]) => {
      const question = questions.get(key);
      if (!question) return false;
      return 'notApplicable' in envelope || (valueSchema(question)?.safeParse(envelope.value).success ?? false);
    }),
  );
}

export interface Ref {
  id: string;
  name: string;
}
type TableRow = { id?: string; row?: string; cells: Record<string, unknown> };

/**
 * Each person and application a section's tables name, replaced by what `settle` returns (the service checks
 * each against TechCockpit and TRM and names it from there, never from the browser).
 */
export function settleRefs(section: Section, answers: SectionAnswers, settle: (ref: Ref, kind: 'person' | 'application', where: string) => Ref): SectionAnswers {
  const tables = section.groups.flatMap((group) => group.items.filter(isQuestion)).filter((q): q is TableQuestion => q.type === 'table');
  const result = { ...answers };
  for (const question of tables) {
    const envelope = answers[question.key];
    if (!envelope || !('value' in envelope)) continue;
    const settleCell = (column: TableColumn, cell: unknown): unknown => {
      const where = `${column.label} in ${question.label}`;
      // A typed name has nothing to check against: it stays as typed.
      if (column.type === 'person') return 'id' in (cell as object) ? settle(cell as Ref, 'person', where) : cell;
      const { items, ...rest } = cell as { items: Ref[]; other?: string };
      return { ...rest, items: items.map((item) => settle(item, 'application', where)) };
    };
    const named = question.columns.filter((column) => column.type === 'person' || column.type === 'applications');
    result[question.key] = {
      value: (envelope.value as TableRow[]).map((row) => ({
        ...row,
        cells: Object.fromEntries(Object.entries(row.cells).map(([key, cell]) => {
          const column = named.find((c) => c.key === key);
          return [key, column ? settleCell(column, cell) : cell];
        })),
      })),
    };
  }
  return result;
}
