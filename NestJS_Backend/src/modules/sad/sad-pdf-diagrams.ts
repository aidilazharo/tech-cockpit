import type { Content } from 'pdfmake/interfaces.js';
import { SLOT_OWNER, type Diagram, type DiagramContent, type DiagramSlot, type DiagramView, type Line } from './domain/diagrams.js';
import { SAD_SECTIONS, type SadSectionKey } from './domain/sections.js';
import type { DiagramRef } from './domain/template-types.js';
import { MAX_UPLOADS_PER_DIAGRAM } from './domain/uploads.js';
import type { IconSvg } from './sad-pdf-icons.js';
import { apiName, boxKind, CLASSIFICATIONS, dataObjects, direction, FLOW_TYPE_NAMES, lineStyle, PATTERN_NAMES, stepKind, tlsText, zoneKind, zonePath } from './sad-pdf-labels.js';
import { GREY, malaysiaDate, table } from './sad-pdf-style.js';
import { diagramSvg } from './sad-pdf-svg.js';

/**
 * The diagrams a template group shows, for the SAD PDF (docs/modules/sad.md, PDF): each diagram (each infrastructure
 * tab, each CI and CD flow) on its own landscape page, drawn by the server, followed by the tables the web app shows
 * for that view and the list of its files. Only what the reader may see: the slots and facts come from the diagrams view.
 */

/** A diagram slot as its reader sees it (other views' facts already left out). */
export interface PdfDiagramSlot {
  slot: DiagramSlot;
  owner: SadSectionKey;
  readableViews: DiagramView[];
  content: DiagramContent;
}
/** A file under a diagram (the uploader is null when the reader may not see names). */
export interface PdfUpload {
  slot: DiagramSlot;
  diagramId: string;
  name: string;
  type: string;
  size: number;
  scan: string;
  uploadedBy: { name: string } | null;
  uploadedAt: string;
}
export interface PdfDiagrams {
  slots: PdfDiagramSlot[];
  /** The API inventory's APIs by name (for readers of the Integration view) */
  apis: { id: string; name: string }[];
  uploads: PdfUpload[];
}
/** What goes on a page of its own: a diagram on a landscape page, or a Not applicable answer in the section's flow. */
export interface DiagramPage {
  landscape: boolean;
  content: Content[];
}

const SLOT_NAMES: Record<DiagramSlot, string> = { solution: 'Solution diagram', infrastructure: 'Infrastructure diagram', 'ci-cd': 'CI and CD flows', monitoring: 'Monitoring diagram' };
const VIEW_NAMES: Record<DiagramView, string> = {
  solution: 'Solution view',
  'data-flow': 'Data flow view',
  infrastructure: 'Infrastructure view',
  integration: 'Integration view',
  process: 'Process view',
  monitoring: 'Monitoring view',
};
const TAB_NAMES = { production: 'Production', 'non-production': 'Non-production' } as const;
const SCAN_NAMES: Record<string, string> = { scanning: 'Being checked for malware', malicious: 'Blocked: malware found', failed: 'Could not be checked for malware' };

/** Room for a drawing on a landscape A4 page below its heading (pt), and the canvas's full size (a pixel is 0.75 pt). */
const AREA = { width: 760, height: 400 };
const FULL_SIZE = 0.75;

const sectionTitle = (key: SadSectionKey) => SAD_SECTIONS.find((section) => section.key === key)!.title;

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** A table under its caption, or what the web app says when it is empty; a wide one in small type with tight cells. */
function captioned(caption: string, headers: string[], rows: string[][], empty: string, wide = false): Content[] {
  return [{ text: caption, style: 'caption' }, rows.length > 0 ? table(headers, rows, undefined, wide ? 7 : 8, wide ? 2 : 4) : { text: empty, color: GREY, fontSize: 9, margin: [0, 0, 0, 8] }];
}

function namesOf(diagram: Diagram) {
  const names = new Map([...diagram.zones, ...diagram.boxes].map((item) => [item.id, item.label]));
  // Every parent and line end is on the diagram (the API refuses others).
  const name = (id: string | undefined) => (id === undefined ? '' : names.get(id)!);
  // The PDF's font has no arrow, so a line's ends are two columns (the web app shows "From → To").
  return { name, inside: (parentId: string | undefined) => name(parentId) || '—', ends: (line: Line) => [name(line.from), name(line.to)] };
}

const orDash = (value: string | number | undefined) => (value === undefined ? '—' : String(value));
const classification = (line: Line) => (line.classification ? CLASSIFICATIONS[line.classification] : '—');

/** The tables the web app shows under a diagram in this view. */
function tables(slot: DiagramSlot, view: DiagramView, diagram: Diagram, readable: readonly DiagramView[]): Content[] {
  const { inside, ends, name } = namesOf(diagram);
  const groups = () => captioned('Grouping boxes', ['Name', 'Kind', 'Inside'], diagram.zones.map((zone) => [zone.label, zone.kind ?? '—', inside(zone.parentId)]), 'No grouping boxes yet.');
  const blocks = (kind: string) => captioned('Blocks', ['Name', kind, 'Inside'], diagram.boxes.map((box) => [box.label, boxKind(slot, box), inside(box.parentId)]), 'No blocks yet.');
  const labelled = (lines: Line[], empty: string) => captioned('Connections', ['From', 'To', 'Label', 'Style'], lines.map((line) => [...ends(line), line.label ?? '—', lineStyle(line)]), empty);
  switch (view) {
    case 'solution':
    case 'data-flow': {
      const calls = view === 'solution' ? ['What it calls', 'What it does', 'Direction'] : readable.includes('solution') ? ['What it calls'] : [];
      const data = view === 'data-flow' ? ['Data objects and key attributes', 'Classification', 'Frequency / volume'] : [];
      const facts = (line: Line) => [line.calls ?? '—', line.does ?? '—', direction(line)].slice(0, calls.length);
      const dataFacts = (line: Line) => (data.length > 0 ? [dataObjects(line).join('; ') || '—', classification(line), line.frequency ?? '—'] : []);
      return [
        ...(view === 'solution' ? groups() : []),
        ...blocks('Type'),
        ...captioned('Connections', ['From', 'To', ...calls, ...data], diagram.lines.map((line) => [...ends(line), ...facts(line), ...dataFacts(line)]), 'No connections yet.'),
        ...(view === 'solution' ? logicalMatrix(diagram, readable.includes('data-flow')) : []),
      ];
    }
    case 'infrastructure':
    case 'integration': {
      const integration = view === 'integration';
      const shown = diagram.lines.filter((line) => (line.layer === 'integration') === integration);
      const renamed = (kind: string | undefined, own: boolean | undefined) => `${zoneKind(kind)}${own ? ' · name changed for this diagram' : ''}`;
      return [
        // Every infrastructure zone has a kind (the API refuses one without).
        ...captioned('Zones', ['Name', 'Kind', 'Inside'], diagram.zones.map((zone) => [zone.label, renamed(zone.kind, zone.ownName), inside(zone.parentId)]), 'No zones yet.'),
        ...captioned('Boxes', ['Name', 'Kind', 'Inside'], diagram.boxes.map((box) => [box.label, boxKind(slot, box), inside(box.parentId)]), 'No boxes yet.'),
        ...(integration
          ? captioned(
              'Connections',
              ['From', 'To', 'Protocol and port', 'TLS', 'Pattern'],
              shown.map((line) => [...ends(line), [line.protocol, line.port].filter((part) => part !== undefined).join(' ') || '—', tlsText(line), line.pattern ? PATTERN_NAMES[line.pattern] : '—']),
              'No connections yet.',
            )
          : captioned('Lines', ['From', 'To', 'Label', 'Style'], shown.map((line) => [...ends(line), line.label ?? '—', lineStyle(line)]), 'No lines yet.')),
      ];
    }
    case 'process':
      return [
        ...captioned('Lanes', ['Order', 'Name', 'Steps'], diagram.zones.map((lane, index) => [String(index + 1), lane.label, String(diagram.boxes.filter((step) => step.parentId === lane.id).length)]), 'No lanes yet.'),
        ...captioned('Steps', ['Name', 'Kind', 'Lane', 'Who approves'], diagram.boxes.map((step) => [step.label, stepKind(step.type), name(step.parentId) || '—', step.approver ?? '—']), 'No steps yet.'),
        ...labelled(diagram.lines, 'No lines yet.'),
      ];
    case 'monitoring':
      return [...groups(), ...blocks('Kind'), ...labelled(diagram.lines, 'No lines yet.')];
  }
}

/** Section 2's logical communication matrix: the data columns only for readers of section 9. */
function logicalMatrix(diagram: Diagram, data: boolean): Content[] {
  const { name } = namesOf(diagram);
  const headers = ['Source', 'Destination', 'What it calls', 'What it does', 'Direction', ...(data ? ['Data objects and key attributes', 'Classification', 'Frequency / volume'] : [])];
  const rows = diagram.lines.map((line) => [
    name(line.from),
    name(line.to),
    line.calls ?? '—',
    line.does ?? '—',
    direction(line),
    ...(data ? [dataObjects(line).join('; ') || '—', classification(line), line.frequency ?? '—'] : []),
  ]);
  return captioned('Logical communication matrix', headers, rows, 'No connections yet.');
}

/** Section 2's technical communication matrix: the integration connections of both tabs. */
function technicalMatrix(diagrams: Diagram[], apis: PdfDiagrams['apis']): Content[] {
  const rows = diagrams.flatMap((diagram) => {
    const { name } = namesOf(diagram);
    return diagram.lines
      .filter((line) => line.layer === 'integration')
      .map((line) => [
        TAB_NAMES[diagram.tab!],
        name(line.from),
        zonePath(diagram, line.from),
        name(line.to),
        zonePath(diagram, line.to),
        orDash(line.protocol),
        orDash(line.port),
        tlsText(line),
        direction(line),
        line.pattern ? PATTERN_NAMES[line.pattern] : '—',
        orDash(line.authentication),
        apiName(apis, line),
        classification(line),
        orDash(line.purpose),
        line.flow ? FLOW_TYPE_NAMES[line.flow] : '—',
      ]);
  });
  const headers = ['Environment', 'Source', 'Source zone', 'Destination', 'Destination zone', 'Protocol', 'Port', 'TLS', 'Direction', 'Pattern', 'Authentication', 'API', 'Classification', 'Purpose', 'Flow type'];
  return captioned('Technical communication matrix', headers, rows, 'No connections yet.', true);
}

/** The files under a diagram, as the web app lists them (they are not put inside the PDF). */
function files(slot: DiagramSlot, diagramId: string, uploads: PdfUpload[]): Content[] {
  const mine = uploads.filter((upload) => upload.slot === slot && upload.diagramId === diagramId);
  const rows = mine.map((file) => [file.name, file.type.toUpperCase(), formatSize(file.size), file.uploadedBy?.name ?? 'Restricted', malaysiaDate(new Date(file.uploadedAt)), SCAN_NAMES[file.scan] ?? '—']);
  return captioned(`Files (${mine.length} of ${MAX_UPLOADS_PER_DIAGRAM})`, ['Name', 'Type', 'Size', 'Uploaded by', 'Uploaded', 'Malware check'], rows, 'No files under this diagram.');
}

/** The pages a group's diagram reference adds to the PDF: none when the reader cannot see the slot. */
export function diagramPages(ref: DiagramRef, section: SadSectionKey, data: PdfDiagrams, icons: (id: string) => IconSvg | null): DiagramPage[] {
  const slot = data.slots.find((item) => item.slot === ref.slot);
  if (!slot) return [];
  const owned = slot.owner === section && ref.view === SLOT_OWNER[ref.slot].view;
  const title = ref.view === SLOT_OWNER[ref.slot].view ? SLOT_NAMES[ref.slot] : `${SLOT_NAMES[ref.slot]}: ${VIEW_NAMES[ref.view]}`;
  const drawnIn: Content[] = owned ? [] : [{ text: `Drawn in “${sectionTitle(slot.owner)}”.`, color: GREY, margin: [0, 0, 0, 6] }];
  if ('notApplicable' in slot.content) return [{ landscape: false, content: [{ text: title, style: 'h3' }, ...drawnIn, { text: `Does not apply: ${slot.content.reason}`, margin: [0, 0, 0, 8] }] }];
  const { diagrams } = slot.content;
  const pages = diagrams.map((diagram): DiagramPage => {
    const name = diagram.tab ? TAB_NAMES[diagram.tab] : ref.slot === 'solution' ? null : diagram.title;
    const picture = diagramSvg(diagram, ref.slot, ref.view, icons);
    const scale = Math.min(FULL_SIZE, AREA.width / picture.width, AREA.height / picture.height);
    return {
      landscape: true,
      content: [
        { text: name ? `${title} — ${name}` : title, style: 'h3' },
        ...drawnIn,
        { svg: picture.svg, width: picture.width * scale, height: picture.height * scale, margin: [0, 4, 0, 10] },
        ...tables(ref.slot, ref.view, diagram, slot.readableViews),
        ...files(ref.slot, diagram.id, data.uploads),
      ],
    };
  });
  // Section 2 shows the technical matrix of both tabs after them.
  if (ref.view === 'integration') pages[pages.length - 1].content.push(...technicalMatrix(diagrams, data.apis));
  return pages;
}
