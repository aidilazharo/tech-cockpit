import type { DiagramSlot, DiagramView } from './diagrams.js';
import type { SadSectionKey } from './sections.js';

export interface Option {
  value: string;
  label: string;
  /** Longer text shown with the option (e.g. regulation requirements) */
  description?: string;
}

/**
 * Shows a question or group only when another question's answer matches. `anyOf`: one of the
 * selected values is listed; `anyExcept`: a selected value is not listed (e.g. anything but "none").
 * Yes/no answers are the values 'yes' and 'no'. A hidden, unanswered or not-applicable question never matches.
 */
export interface Condition {
  question: string;
  anyOf?: string[];
  anyExcept?: string[];
}

/** Advice shown with a question when every test holds (the answer stays valid). Tests name questions of the same section. */
export interface Warning {
  text: string;
  when: { question: string; anyOf?: string[]; over?: number }[];
}

interface QuestionBase {
  /** Unique across the template, kebab-case */
  key: string;
  label: string;
  hint?: string;
  showWhen?: Condition;
  warning?: Warning;
  /** false: the question cannot be marked Not applicable (it must be answered when it applies) */
  allowNotApplicable?: false;
  /** Names of people: personal data */
  personal?: boolean;
}

/** Formatted text (paragraphs, bold, italic, lists, links) */
export interface RichTextQuestion extends QuestionBase {
  type: 'text';
}
/** One line of plain text */
export interface ShortTextQuestion extends QuestionBase {
  type: 'short';
}
export interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  options: Option[];
  /** Adds "Other (specify)" */
  other?: boolean;
}
export interface MultiQuestion extends QuestionBase {
  type: 'multi';
  options: Option[];
  other?: boolean;
}
export interface YesNoQuestion extends QuestionBase {
  type: 'yesno';
  /** Label of the details box (defaults to "Details") */
  detailsLabel?: string;
}
export interface NumberQuestion extends QuestionBase {
  type: 'number';
  unit?: string;
}
export interface DateQuestion extends QuestionBase {
  type: 'date';
}
export interface LinksQuestion extends QuestionBase {
  type: 'links';
}

/** person: picked from TechCockpit users ({ id, name }) or typed ({ name }); dataObjects: rows of data object and key attributes */
export const COLUMN_TYPES = ['text', 'choice', 'yesno', 'number', 'date', 'person', 'applications', 'dataObjects'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export interface TableColumn {
  key: string;
  label: string;
  type: ColumnType;
  options?: Option[];
  /** Not needed for the row to count as complete */
  optional?: boolean;
  personal?: boolean;
}

export interface TableQuestion extends QuestionBase {
  type: 'table';
  columns: TableColumn[];
  /** Fixed first-column labels (e.g. the control table); answered row by row */
  fixedRows?: string[];
  /** Whether authors add their own rows */
  addRows: boolean;
  /** Groups of (optional) columns of which each row needs at least one, e.g. a URL for one environment */
  oneOf?: string[][];
}

/** Values read from TRM (ServiceNow export plus TechCockpit assignments). */
export const TRM_SOURCES = [
  'name',
  'number',
  'description',
  'capability',
  'portfolios',
  'displayName',
  'ownedBusinessUnit',
  'bcmCriticality',
  'rpoRto',
  'dataClassification',
  'businessOwner',
  'itApplicationOwner',
  'applicationManager',
  'applicationLead',
  'productManagers',
  'portfolioLeads',
  'environment',
] as const;
export type TrmSource = (typeof TRM_SOURCES)[number];

/** Read-only from TRM; when TRM has no value the author answers it (text, or a choice). */
export interface TrmQuestion extends QuestionBase {
  type: 'trm';
  source: TrmSource;
  fallback?: { type: 'choice'; options: Option[] } | { type: 'none' };
}

/** Rows from the admin-maintained backup retention list: tick the ones that apply, fill resource names. */
export interface RetentionQuestion extends QuestionBase {
  type: 'retention';
}

export type Question =
  | RichTextQuestion
  | ShortTextQuestion
  | ChoiceQuestion
  | MultiQuestion
  | YesNoQuestion
  | NumberQuestion
  | DateQuestion
  | LinksQuestion
  | TableQuestion
  | TrmQuestion
  | RetentionQuestion;
export type QuestionType = Question['type'];

/** Guidance text, not a question */
export interface Note {
  type: 'note';
  key: string;
  text: string;
}

export interface Group {
  key: string;
  title?: string;
  intro?: string;
  showWhen?: Condition;
  /** Diagrams shown here (SAD part 2): drawn in the slot's owning section, shown read-only or as another view elsewhere */
  diagrams?: DiagramRef[];
  items: (Question | Note)[];
}

/** A diagram slot shown in a group, in one of its views. */
export interface DiagramRef {
  slot: DiagramSlot;
  view: DiagramView;
}

/** A question a later template version no longer asks: approved versions still show its answer, marked "No longer asked". */
export interface RetiredQuestion {
  key: string;
  label: string;
  type: 'text' | 'yesno' | 'number';
  /** The template version that stopped asking it */
  removedIn: number;
  /** For a number */
  unit?: string;
}

export interface Section {
  key: SadSectionKey;
  title: string;
  intro?: string;
  groups: Group[];
  references: string[];
  retired?: RetiredQuestion[];
}

export interface SadTemplate {
  version: number;
  sections: Section[];
}

export const isQuestion = (item: Question | Note): item is Question => item.type !== 'note';
