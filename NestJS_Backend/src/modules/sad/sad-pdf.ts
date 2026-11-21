import type { Content, Decoration, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces.js';
import type { Envelope } from './domain/answers.js';
import type { SadHistoryAction, SadHistoryRow } from './domain/history.js';
import type { FONT_SIZES, RichBlock, RichDoc, RichInline, RichMark, RichParagraph } from './domain/rich-text.js';
import { SAD_PRINTED_TWICE, SAD_TEMPLATE } from './domain/template.js';
import { isQuestion, type Option, type Question, type TableQuestion } from './domain/template-types.js';
import { diagramPages, type DiagramPage, type PdfDiagrams } from './sad-pdf-diagrams.js';
import { azureIconSvg } from './sad-pdf-icons.js';
import { displayDate, GREY, MAROON, malaysiaDate, table } from './sad-pdf-style.js';
import type { EnvironmentService } from './sad-trm.js';

// The SAD as a PDF in the layout of AIA Malaysia's SAD template: title, Document Details,
// Version Control, then each section's questions and answers, and its diagrams (each on a landscape
// page of its own). Built only from what the reader may see (the version and diagrams views), so
// restricted sections, facts and names never reach the file.

const TBC: Content = { text: '[To be completed]', color: GREY };
const QUESTIONS = new Map(SAD_TEMPLATE.sections.flatMap((section) => section.groups.flatMap((group) => group.items.filter(isQuestion).map((question) => [question.key, { section: section.key, question }] as const))));

export interface PdfVersion {
  application: { name: string | null; number: string | null };
  status: 'draft' | 'in_approval' | 'current' | 'superseded' | 'cancelled';
  number: number | null;
  draftOf: number | null;
  trm: { values: Record<string, unknown>; restricted: string[] } | null;
  sections: { key: string; readable: boolean; answers: Record<string, Envelope> | null }[];
  hidden: string[];
  /** Section 5 says the application does its own authentication (null for readers who cannot read section 5) */
  localAuthentication?: boolean | null;
}

export interface PdfHistoryRow {
  user: string;
  action: string;
  state: string;
  comment: string;
  date: string;
  version: string;
}

const HISTORY: Record<SadHistoryAction, { action: string; state: string | null }> = {
  started: { action: 'Started draft', state: 'Draft' },
  submitted: { action: 'Submitted', state: 'In approval' },
  resubmitted: { action: 'Resubmitted', state: 'In approval' },
  withdrawn: { action: 'Withdrawn', state: 'Draft' },
  // Decisions, questions and answers: the step they were at.
  info_requested: { action: 'Asked for information', state: null },
  answered: { action: 'Answered', state: null },
  approved: { action: 'Approved', state: null },
  returned: { action: 'Returned', state: null },
  version_approved: { action: 'Version approved', state: 'Current' },
};

/** The Version Control rows as the PDF prints them (users already named, or "Restricted"). */
export function pdfHistory(rows: SadHistoryRow<string>[], version: string): PdfHistoryRow[] {
  return rows.map((row) => ({
    user: row.user ?? '',
    action: HISTORY[row.action].action,
    state: HISTORY[row.action].state ?? row.step!,
    comment: row.comment ?? '',
    date: malaysiaDate(row.at),
    version,
  }));
}

export interface PdfRetentionRow {
  id: string;
  serviceType: string;
  dataType: string;
  yearly: string;
  monthly: string;
  weekly: string;
  daily: string;
  comment: string | null;
}

const STATUS: Record<PdfVersion['status'], string> = {
  draft: 'Draft',
  in_approval: 'In approval',
  current: 'Approved (current version)',
  superseded: 'Approved (superseded)',
  cancelled: 'Cancelled',
};

export { displayDate, malaysiaDate };

/** A table; an empty one says it is still to be completed. */
const grid = (headers: string[], rows: TableCell[][], widths?: (string | number)[]): Content => table(headers, rows.length > 0 ? rows : [headers.map(() => TBC as TableCell)], widths);

/** Font sizes of rich text (normal is the document's 10). */
const FONT_SIZE: Record<(typeof FONT_SIZES)[number], number> = { small: 8, large: 12 };
const HEADING_SIZE = { 4: 12, 5: 11 };

function inline(item: RichInline): Content {
  if (item.type === 'hardBreak') return { text: '\n' };
  const marks = item.marks ?? [];
  const has = (type: RichMark['type']) => marks.some((mark) => mark.type === type);
  const link = marks.find((mark) => mark.type === 'link');
  const size = marks.find((mark) => mark.type === 'textStyle');
  const decoration: Decoration[] = [...(has('underline') || link ? (['underline'] as const) : []), ...(has('strike') ? (['lineThrough'] as const) : [])];
  return {
    text: item.text,
    bold: has('bold') || undefined,
    italics: has('italic') || undefined,
    ...(decoration.length > 0 ? { decoration } : {}),
    ...(size?.type === 'textStyle' ? { fontSize: FONT_SIZE[size.attrs.fontSize] } : {}),
    ...(link?.type === 'link' ? { link: link.attrs.href, color: MAROON } : {}),
  };
}

const paragraph = (item: RichParagraph): Content => ({ text: (item.content ?? []).map(inline), margin: [0, 0, 0, 4] });

function block(item: RichBlock): Content {
  if (item.type === 'paragraph') return paragraph(item);
  if (item.type === 'heading') return { text: (item.content ?? []).map(inline), bold: true, fontSize: HEADING_SIZE[item.attrs.level], margin: [0, 4, 0, 2] };
  if (item.type === 'table') {
    const cells = (row: (typeof item.content)[number]): TableCell[] => row.content.map((cell) => ({ stack: cell.content.map(paragraph), bold: cell.type === 'tableHeader' || undefined }));
    return { table: { body: item.content.map(cells) }, layout: { hLineColor: () => '#BDBDBD', vLineColor: () => '#BDBDBD' }, margin: [0, 2, 0, 6] };
  }
  const items = item.content.map((listItem) => listItem.content.map(block));
  return item.type === 'bulletList' ? { ul: items, margin: [0, 0, 0, 4] } : { ol: items, start: item.attrs?.start ?? 1, margin: [0, 0, 0, 4] };
}

const labelOf = (options: Option[], value: string, other?: string) => (value === 'other' ? `Other: ${other ?? ''}` : (options.find((o) => o.value === value)?.label ?? value));

function environmentContent(services: EnvironmentService[]): Content {
  if (services.length === 0) return { text: 'TRM has no application services for this application.', color: GREY };
  return grid(
    ['Application service', 'Environment', 'Servers', 'Software models'],
    services.map((service) => [
      service.name ?? '—',
      service.environment ?? '—',
      service.servers.join(', ') || '—',
      service.software.map((s) => [s.name, s.version, s.standard ? `(${s.standard}${s.standardStatus ? `: ${s.standardStatus}` : ''})` : null].filter(Boolean).join(' ')).join('\n') || '—',
    ]),
  );
}

function tableContent(question: TableQuestion, rows: { row?: string; cells: Record<string, unknown> }[]): Content {
  const columns = question.columns;
  const cell = (column: (typeof columns)[number], value: unknown): string => {
    if (value === undefined || value === null || value === '') return '';
    const plain = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    switch (column.type) {
      case 'choice':
        // Choice columns always list their options in the template.
        return labelOf(column.options!, plain);
      case 'yesno':
        return value === 'yes' ? 'Yes' : 'No';
      case 'date':
        return displayDate(plain);
      case 'person':
        // Picked or typed: both have a name.
        return (value as { name: string }).name;
      case 'dataObjects':
        return (value as { object: string; attributes: string }[]).map((row) => `${row.object}: ${row.attributes}`).join('\n');
      case 'applications': {
        const apps = value as { items: { name: string }[]; other?: string };
        return [...apps.items.map((a) => a.name), apps.other].filter(Boolean).join(', ');
      }
      default:
        return plain;
    }
  };
  const labelled = Boolean(question.fixedRows);
  return grid(
    [...(labelled ? [''] : []), ...columns.map((column) => column.label)],
    // Every row of a table with fixed rows has its label (answers are validated on save).
    rows.map((row) => [...(labelled ? [{ text: row.row!, bold: true }] : []), ...columns.map((column) => cell(column, row.cells[column.key]))]),
  );
}

function answerContent(question: Question, envelope: Envelope | undefined, version: PdfVersion, retention: PdfRetentionRow[]): Content {
  if (question.type === 'trm') {
    if (version.trm?.restricted.includes(question.source)) return { text: 'Restricted', color: GREY };
    const value = version.trm?.values[question.source];
    if (question.source === 'environment') return environmentContent((value as EnvironmentService[] | undefined) ?? []);
    if (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '') return { text: Array.isArray(value) ? value.join(', ') : String(value) };
  }
  if (!envelope) return TBC;
  if ('notApplicable' in envelope) return { text: [{ text: 'Not applicable: ', italics: true }, envelope.reason] };
  const value = envelope.value as never;
  switch (question.type) {
    case 'text':
      // Answered in one line before the template asked for rich text (version 3): approved versions keep it.
      if (typeof value === 'string') return { text: value };
      return (value as RichDoc).content.map(block);
    case 'short':
    case 'number':
      return { text: `${String(value as string | number)}${question.type === 'number' && question.unit ? ` ${question.unit}` : ''}` };
    case 'date':
      return { text: displayDate(value) };
    case 'choice':
    case 'multi': {
      const { selected, other } = value as { selected: string | string[]; other?: string };
      return { text: (Array.isArray(selected) ? selected : [selected]).map((v) => labelOf(question.options, v, other)).join(', ') || '—' };
    }
    case 'yesno': {
      const { answer, details } = value as { answer: string; details?: string };
      return { text: [{ text: answer === 'yes' ? 'Yes' : 'No', bold: true }, details ? ` — ${details}` : ''] };
    }
    case 'links':
      return { ul: (value as { label?: string; url: string }[]).map((link) => ({ text: link.label ? `${link.label}: ${link.url}` : link.url, link: link.url, color: MAROON })) };
    case 'table':
      return tableContent(question, value);
    case 'retention': {
      const rows = (value as { rows: { standardId: string; resourceName: string; comment?: string }[] }).rows;
      return grid(
        ['Service type', 'Data type hosted', 'Resource name', 'Yearly', 'Monthly', 'Weekly', 'Daily', 'Comment'],
        rows.map((row) => {
          const standard = retention.find((r) => r.id === row.standardId);
          return [standard?.serviceType ?? '—', standard?.dataType ?? '—', row.resourceName, standard?.yearly ?? '', standard?.monthly ?? '', standard?.weekly ?? '', standard?.daily ?? '', [standard?.comment, row.comment].filter(Boolean).join(' ')];
        }),
      );
    }
    case 'trm': {
      const fallback = value as string | { selected: string };
      const options = question.fallback?.type === 'choice' ? question.fallback.options : [];
      return { text: typeof fallback === 'string' ? fallback : labelOf(options, fallback.selected) };
    }
  }
}

const NO_DIAGRAMS: PdfDiagrams = { slots: [], apis: [], uploads: [] };

/** The document definition for one SAD version, as its reader may see it. */
export function buildSadPdf(
  version: PdfVersion,
  history: PdfHistoryRow[],
  retention: PdfRetentionRow[],
  generatedAt: Date,
  diagrams: PdfDiagrams = NO_DIAGRAMS,
  icons = azureIconSvg,
): TDocumentDefinitions {
  const hidden = new Set(version.hidden);
  // A diagram starts a landscape page of its own; what follows it starts a portrait page again.
  let landscape = false;
  const add = (...items: Content[]) => {
    if (!landscape) return content.push(...items);
    landscape = false;
    return content.push({ stack: items, pageBreak: 'before', pageOrientation: 'portrait' });
  };
  const addPage = (page: DiagramPage) => {
    if (!page.landscape) return add(...page.content);
    landscape = true;
    return content.push({ stack: page.content, pageBreak: 'before', pageOrientation: 'landscape' });
  };
  const content: Content[] = [
    { text: 'SOLUTION ARCHITECTURE DOCUMENT', style: 'title', alignment: 'center' },
    { text: version.application.name ?? version.application.number ?? '', bold: true, alignment: 'center', margin: [0, 6, 0, 16] },
    { text: 'Document Details', style: 'h1' },
    grid(['Field', 'Response'], [
      ['Document Status', STATUS[version.status]],
      ['Version', version.number !== null ? String(version.number) : `Draft of version ${version.draftOf ?? 1}`],
      ['APM ID', version.application.number ?? '—'],
      ...(version.localAuthentication ? [['Local authentication', 'Yes: the application does its own authentication (see Security Architecture Design)']] : []),
    ]),
    { text: 'Version Control', style: 'h1' },
    grid(
      ['User', 'Action', 'State', 'Comment', 'Date', 'Version'],
      history.map((row) => [row.user, row.action, row.state, row.comment, row.date, row.version]),
      ['*', 'auto', 'auto', '*', 'auto', 'auto'],
    ),
  ];
  const omitted: string[] = [];
  for (const section of SAD_TEMPLATE.sections) {
    const data = version.sections.find((s) => s.key === section.key);
    if (!data?.readable || !data.answers) {
      omitted.push(section.title);
      continue;
    }
    add({ text: section.title, style: 'h1' });
    if (section.intro) add({ text: section.intro, color: GREY, margin: [0, 0, 0, 6] });
    for (const group of section.groups) {
      const questions = group.items.filter(isQuestion).filter((question) => !hidden.has(question.key));
      const pages = (group.diagrams ?? []).flatMap((ref) => diagramPages(ref, section.key, diagrams, icons));
      if (questions.length === 0 && pages.length === 0) continue;
      if (group.title) add({ text: group.title, style: 'h2' });
      if (group.intro) add({ text: group.intro, margin: [0, 0, 0, 4] });
      for (const item of group.items) {
        if (item.type === 'note') {
          add({ text: item.text, italics: true, color: GREY, margin: [0, 0, 0, 4] });
          continue;
        }
        if (hidden.has(item.key)) continue;
        for (const printed of SAD_PRINTED_TWICE.filter((p) => p.section === section.key && p.group === group.key && p.before === item.key)) {
          // Asked once, elsewhere: printed here too, for readers of the section that asks it.
          const asked = QUESTIONS.get(printed.from)!;
          const source = version.sections.find((s) => s.key === asked.section);
          // Answers are null for sections the reader cannot view.
          if (!source?.answers || hidden.has(printed.from)) continue;
          add({ text: printed.label, bold: true, margin: [0, 4, 0, 2] }, { stack: [answerContent(asked.question, source.answers[printed.from], version, retention)], margin: [12, 0, 0, 6] });
        }
        add({ text: item.label, bold: true, margin: [0, 4, 0, 2] }, { stack: [answerContent(item, data.answers[item.key], version, retention)], margin: [12, 0, 0, 6] });
      }
      pages.forEach(addPage);
    }
    // Approved versions keep answers to questions later templates removed (the view sends them only then).
    for (const question of section.retired ?? []) {
      const answer = data.answers[question.key];
      if (!answer) continue;
      add({ text: [question.label, { text: '  No longer asked', bold: false, italics: true, color: GREY }], bold: true, margin: [0, 4, 0, 2] }, { stack: [answerContent({ ...question }, answer, version, retention)], margin: [12, 0, 0, 6] });
    }
    if (section.references.length > 0) add({ text: 'Reference:', margin: [0, 4, 0, 2] }, { ul: section.references, margin: [0, 0, 0, 8] });
  }
  if (omitted.length > 0) {
    add({ text: 'Sections not included', style: 'h1' }, { text: 'You do not have access to these sections:', margin: [0, 0, 0, 4] }, { ul: omitted });
  }
  return {
    info: { title: `SAD - ${version.application.name ?? version.application.number ?? 'application'}`, creator: 'AIA TechCockpit' },
    pageMargins: [40, 50, 40, 50],
    header: { text: 'AIA Malaysia | Solution Architecture Document', alignment: 'right', fontSize: 8, color: GREY, margin: [40, 20, 40, 0] },
    footer: (page, pages) => ({
      columns: [
        { text: `Generated ${malaysiaDate(generatedAt)} from AIA TechCockpit`, fontSize: 8, color: GREY },
        { text: `Page ${page} of ${pages}`, alignment: 'right', fontSize: 8, color: GREY },
      ],
      margin: [40, 10, 40, 0],
    }),
    watermark: version.status === 'draft' || version.status === 'in_approval' ? { text: 'DRAFT', opacity: 0.08, bold: true } : undefined,
    content,
    styles: {
      title: { fontSize: 20, bold: true, color: MAROON },
      h1: { fontSize: 15, bold: true, color: MAROON, margin: [0, 14, 0, 6] },
      h2: { fontSize: 12, bold: true, color: MAROON, margin: [0, 8, 0, 4] },
      h3: { fontSize: 11, bold: true, color: MAROON, margin: [0, 6, 0, 4] },
      caption: { fontSize: 10, bold: true, margin: [0, 6, 0, 2] },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.2 },
  };
}
