import { isDeepStrictEqual } from 'node:util';
import { z, type ZodType } from 'zod';
import { NotApplicableSchema } from './answers.js';
import { AZURE_ICON_IDS } from './azure-icons.js';
import {
  DEFAULT_HOSTING,
  emptyZoneWidth,
  fixedZones,
  FLOW_TYPES,
  HOSTING_FIELDS,
  HostingSchema,
  infrastructureRules,
  INTEGRATION_FACTS,
  NON_COMPLIANT_TLS,
  PATTERNS,
  TLS_VERSIONS,
  type Hosting,
} from './infrastructure.js';
import { monitoringRules } from './monitoring.js';
import { approversNamed, processRules } from './process.js';
import type { SadSectionKey } from './sections.js';

/**
 * SAD part 2 diagrams (docs/modules/sad.md). A version has one slot per diagram; each slot is drawn in its
 * owning section and shown in other sections as views (e.g. section 9 shows the solution diagram's data flow).
 */
export const DIAGRAM_SLOTS = ['solution', 'infrastructure', 'ci-cd', 'monitoring'] as const;
export type DiagramSlot = (typeof DIAGRAM_SLOTS)[number];

export const DIAGRAM_VIEWS = ['solution', 'data-flow', 'infrastructure', 'integration', 'process', 'monitoring'] as const;
export type DiagramView = (typeof DIAGRAM_VIEWS)[number];

/** The section whose editors draw a slot (and may answer it Not applicable), and the view they draw in. */
export const SLOT_OWNER: Record<DiagramSlot, { section: SadSectionKey; view: DiagramView }> = {
  solution: { section: 'solution-integration', view: 'solution' },
  infrastructure: { section: 'network', view: 'infrastructure' },
  'ci-cd': { section: 'deployment', view: 'process' },
  monitoring: { section: 'logging', view: 'monitoring' },
};

/** The views of each slot: the first draws it, the others show it in other sections. */
export const SLOT_VIEWS: Record<DiagramSlot, readonly DiagramView[]> = {
  solution: ['solution', 'data-flow'],
  infrastructure: ['infrastructure', 'integration'],
  'ci-cd': ['process'],
  monitoring: ['monitoring'],
};

/** The section whose editors edit each view's part of a slot (a view shown in other sections is read-only there). */
export const VIEW_EDITORS: Partial<Record<DiagramView, SadSectionKey>> = {
  solution: 'solution-integration',
  'data-flow': 'data-architecture',
  infrastructure: 'network',
  integration: 'solution-integration',
  process: 'deployment',
  monitoring: 'logging',
};

export const INFRA_TABS = ['production', 'non-production'] as const;
export const SIDES = ['t', 'r', 'b', 'l'] as const;

/** Solution diagram blocks: actors, parts of this application, other business applications and external parties. */
export const BLOCK_TYPES = ['actor', 'part', 'business', 'external'] as const;
/** The AIA data classification list (as in the template's classification questions). */
export const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'highly-confidential'] as const;

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Use letters, digits, - or _ (up to 64)');
const Label = z.string().trim().min(1).max(200);
const Coord = z.number().finite().min(-100_000).max(100_000);
const Size = z.number().finite().min(20).max(50_000);

/** A box that holds other things: a network zone, an Azure level, a data centre or a grouping box. */
export const ZoneSchema = z
  .object({
    id: Id,
    label: Label,
    kind: z.string().trim().max(100).optional(),
    /** Infrastructure: the hosting setting that names this fixed zone, and whether this diagram changed its name */
    hosting: z.enum(HOSTING_FIELDS).optional(),
    ownName: z.literal(true).optional(),
    parentId: Id.optional(),
    x: Coord,
    y: Coord,
    width: Size,
    height: Size,
  })
  .strict();
const Fact = (max: number) => z.string().trim().max(max).optional();
export const BoxSchema = z
  .object({
    id: Id,
    label: Label,
    type: z.string().trim().min(1).max(60),
    /** A business application picked from TRM, with the APM number it was picked with (its name is the label) */
    application: z.object({ id: z.uuid(), number: z.string().trim().max(100).nullable() }).strict().optional(),
    /** Infrastructure: a server picked from the application's TRM servers (its name, as picked, is the label) */
    server: z.object({ id: z.uuid() }).strict().optional(),
    /** An Azure icon from Microsoft's set (any box; an infrastructure Azure service names its service with it) */
    icon: z
      .string()
      .max(100)
      .refine((id) => AZURE_ICON_IDS.has(id), 'Not an Azure icon')
      .optional(),
    /** CI and CD flows: who approves an approval step (e.g. Application manager, CAB) */
    approver: z.string().trim().max(200).optional(),
    parentId: Id.optional(),
    x: Coord,
    y: Coord,
  })
  .strict();
export const LineSchema = z
  .object({
    id: Id,
    from: Id,
    to: Id,
    fromSide: z.enum(SIDES).optional(),
    toSide: z.enum(SIDES).optional(),
    label: z.string().trim().max(500).optional(),
    dashed: z.boolean().optional(),
    twoWay: z.boolean().optional(),
    // Solution diagram: what the connection calls and does (section 2), and its data flow facts (section 9).
    calls: Fact(500),
    does: Fact(500),
    data: Fact(4000),
    classification: z.enum(DATA_CLASSIFICATIONS).optional(),
    frequency: Fact(200),
    // Infrastructure diagram: an integration connection (section 2) and its network facts; other lines are infrastructure lines (section 3).
    layer: z.literal('integration').optional(),
    protocol: Fact(50),
    port: z.number().int().min(1).max(65535).optional(),
    tls: z.enum(TLS_VERSIONS).optional(),
    /** What protects a connection without TLS (e.g. SSH) */
    protection: Fact(200),
    pattern: z.enum(PATTERNS).optional(),
    /** The API in this SAD's API inventory (section 6 table row) */
    api: z.object({ id: z.uuid() }).strict().optional(),
    authentication: Fact(200),
    purpose: Fact(500),
    flow: z.enum(FLOW_TYPES).optional(),
  })
  .strict();

const DiagramShape = z
  .object({
    id: Id,
    title: Label,
    tab: z.enum(INFRA_TABS).optional(),
    sizing: z.enum(['auto', 'manual']),
    zones: z.array(ZoneSchema).max(100),
    boxes: z.array(BoxSchema).max(300),
    lines: z.array(LineSchema).max(500),
  })
  .strict();

export type Zone = z.infer<typeof ZoneSchema>;
export type Box = z.infer<typeof BoxSchema>;
export type Line = z.infer<typeof LineSchema>;
export type Diagram = z.infer<typeof DiagramShape>;
export type DiagramContent = z.infer<typeof NotApplicableSchema> | { diagrams: Diagram[]; hosting?: Hosting };

/** Ids are unique on a diagram; parents are zones (never themselves, even indirectly); lines join two different boxes or zones. */
function checkReferences(diagram: Diagram, ctx: z.RefinementCtx): void {
  const zones = new Map(diagram.zones.map((zone) => [zone.id, zone]));
  const seen = new Set<string>();
  for (const { id } of [...diagram.zones, ...diagram.boxes, ...diagram.lines]) {
    if (seen.has(id)) ctx.addIssue({ code: 'custom', message: `"${id}" is used twice` });
    seen.add(id);
  }
  diagram.zones.forEach((zone, index) => {
    if (zone.parentId === undefined) return;
    if (!zones.has(zone.parentId)) {
      ctx.addIssue({ code: 'custom', path: ['zones', index, 'parentId'], message: 'Not a zone on this diagram' });
      return;
    }
    const visited = new Set([zone.id]);
    for (let at: string | undefined = zone.parentId; at !== undefined; at = zones.get(at)?.parentId) {
      if (visited.has(at)) {
        ctx.addIssue({ code: 'custom', path: ['zones', index, 'parentId'], message: 'A zone cannot be inside itself' });
        return;
      }
      visited.add(at);
    }
  });
  diagram.boxes.forEach((box, index) => {
    if (box.parentId !== undefined && !zones.has(box.parentId)) ctx.addIssue({ code: 'custom', path: ['boxes', index, 'parentId'], message: 'Not a zone on this diagram' });
  });
  const ends = new Set([...zones.keys(), ...diagram.boxes.map((box) => box.id)]);
  diagram.lines.forEach((line, index) => {
    for (const end of ['from', 'to'] as const) {
      if (!ends.has(line[end])) ctx.addIssue({ code: 'custom', path: ['lines', index, end], message: 'Not a box or zone on this diagram' });
    }
    if (line.from === line.to) ctx.addIssue({ code: 'custom', path: ['lines', index, 'to'], message: 'A line needs two different ends' });
  });
}

export const DiagramSchema = DiagramShape.superRefine(checkReferences);

/** The connection facts each view records: its editors change them, and only its readers see them. */
const VIEW_FACTS: Partial<Record<DiagramView, readonly LineFact[]>> = { solution: ['calls', 'does'], 'data-flow': ['data', 'classification', 'frequency'] };
type LineFact = 'calls' | 'does' | 'data' | 'classification' | 'frequency' | Exclude<(typeof INTEGRATION_FACTS)[number], 'classification'>;
/** Facts only solution connections have (the infrastructure diagram's integration connections have a classification too). */
const SOLUTION_ONLY: readonly LineFact[] = ['calls', 'does', 'data', 'frequency'];
const INFRA_ONLY = ['layer', ...INTEGRATION_FACTS.filter((key) => key !== 'classification')] as const;

/**
 * Block types and TRM links on the solution diagram; connection facts only there, instead of a label. TRM
 * applications also on the infrastructure and monitoring diagrams, hosting names and TRM servers only on the infrastructure one.
 */
function solutionRules(slot: DiagramSlot, diagrams: Diagram[], ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path: ['diagrams', ...path], message });
  const infrastructure = slot === 'infrastructure';
  diagrams.forEach((diagram, d) => {
    diagram.zones.forEach((zone, z) => {
      if (!infrastructure && (zone.hosting || zone.ownName)) issue([d, 'zones', z], 'Only the infrastructure diagram has this');
    });
    diagram.boxes.forEach((box, b) => {
      if (!infrastructure && box.server) issue([d, 'boxes', b, 'server'], 'Only the infrastructure diagram has this');
      if (slot !== 'ci-cd' && box.approver !== undefined) issue([d, 'boxes', b, 'approver'], 'Only a CI or CD flow has this');
      if (slot !== 'solution') {
        if (box.application && slot === 'ci-cd') issue([d, 'boxes', b, 'application'], 'Only the solution, infrastructure and monitoring diagrams have this');
        return;
      }
      if (!(BLOCK_TYPES as readonly string[]).includes(box.type)) issue([d, 'boxes', b, 'type'], 'Choose Actor, Part of this application, Business application or External party');
      if (box.application && box.type !== 'business') issue([d, 'boxes', b, 'application'], 'Only a business application block links to TRM');
    });
    if (slot === 'solution' && diagram.zones.filter((zone) => zone.kind === THIS_APPLICATION).length > 1) issue([d, 'zones'], 'Only one grouping box can be "This application"');
    diagram.lines.forEach((line, l) => {
      if (slot === 'solution' && line.label !== undefined) issue([d, 'lines', l, 'label'], 'A connection says what it calls and what it does instead of a label');
      const solutionOnly = infrastructure ? SOLUTION_ONLY : [...SOLUTION_ONLY, 'classification' as const];
      if (slot !== 'solution' && solutionOnly.some((key) => line[key] !== undefined)) issue([d, 'lines', l], 'Only the solution diagram has this');
      if (!infrastructure && INFRA_ONLY.some((key) => line[key] !== undefined)) issue([d, 'lines', l], 'Only the infrastructure diagram has this');
    });
  });
}

function slotRules(slot: DiagramSlot, diagrams: Diagram[], ctx: z.RefinementCtx): void {
  solutionRules(slot, diagrams, ctx);
  if (slot === 'infrastructure') infrastructureRules(diagrams, ctx);
  if (slot === 'ci-cd') processRules(diagrams, ctx);
  if (slot === 'monitoring') monitoringRules(diagrams, ctx);
  const ids = diagrams.map((diagram) => diagram.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['diagrams'], message: 'Each diagram needs its own id' });
  if (slot === 'infrastructure') {
    const tabs = diagrams.map((diagram) => diagram.tab);
    if (tabs.length !== INFRA_TABS.length || tabs.some((tab, index) => tab !== INFRA_TABS[index])) {
      ctx.addIssue({ code: 'custom', path: ['diagrams'], message: 'The infrastructure diagram has a Production and a Non-production tab' });
    }
    // What other sections keep with a tab (their lines and facts, its files) is found again by its id.
    if (diagrams.some((diagram) => diagram.tab !== undefined && diagram.id !== diagram.tab)) {
      ctx.addIssue({ code: 'custom', path: ['diagrams'], message: 'Each tab keeps its id ("production", "non-production")' });
    }
    return;
  }
  if (diagrams.some((diagram) => diagram.tab !== undefined)) ctx.addIssue({ code: 'custom', path: ['diagrams'], message: 'Only the infrastructure diagram has tabs' });
  if (slot === 'solution' && diagrams.length !== 1) ctx.addIssue({ code: 'custom', path: ['diagrams'], message: 'The solution diagram is one diagram' });
  if (slot === 'solution' && diagrams.some((diagram) => diagram.id !== 'solution')) ctx.addIssue({ code: 'custom', path: ['diagrams'], message: 'The solution diagram keeps the id "solution"' });
}

/**
 * What a slot may hold: Not applicable with a reason, or its diagrams. The branch is picked by whether
 * `notApplicable` is sent, so the author sees that branch's own messages (a union only says "Invalid input").
 */
export function slotContentSchema(slot: DiagramSlot): ZodType<DiagramContent> {
  const diagrams = z.array(DiagramSchema).min(1).max(10);
  // The infrastructure diagram keeps the application's hosting settings with it.
  const shape = slot === 'infrastructure' ? z.object({ hosting: HostingSchema, diagrams }) : z.object({ diagrams });
  const drawn = shape.strict().superRefine((value, ctx) => slotRules(slot, value.diagrams, ctx));
  return z.unknown().transform((value, ctx) => {
    const schema = typeof value === 'object' && value !== null && 'notApplicable' in value ? NotApplicableSchema : drawn;
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues) ctx.addIssue({ ...issue, code: 'custom', message: issue.message });
    return z.NEVER;
  }) as unknown as ZodType<DiagramContent>;
}

/** Answered for submit: Not applicable with a reason, or every diagram (both infrastructure tabs) has at least one box. */
export function diagramAnswered(content: DiagramContent): boolean {
  if ('notApplicable' in content) return content.reason.trim() !== '';
  return content.diagrams.length > 0 && content.diagrams.every((diagram) => diagram.boxes.length > 0);
}

/** The facts a connection still needs before submit, in one view. */
export function missingFacts(view: DiagramView, line: Line): LineFact[] {
  const blank = (value: string | undefined) => !value?.trim();
  if (view === 'solution') return (['calls', 'does'] as const).filter((key) => blank(line[key]));
  if (view === 'data-flow' && !blank(line.data)) return (['classification', 'frequency'] as const).filter((key) => blank(line[key]));
  if (view !== 'integration' || line.layer !== 'integration') return [];
  const needed: [LineFact, boolean][] = [
    ['protocol', blank(line.protocol)],
    ['port', line.port === undefined],
    ['tls', !line.tls],
    ['protection', line.tls === 'none' && blank(line.protection)],
    ['pattern', !line.pattern],
    ['api', line.pattern === 'api' && !line.api],
    ['authentication', blank(line.authentication)],
    ['classification', !line.classification],
    ['purpose', blank(line.purpose)],
    ['flow', !line.flow],
  ];
  return needed.filter(([, missing]) => missing).map(([fact]) => fact);
}

/** TLS 1.1 and 1.0 are allowed but flagged as not compliant (no blocker for submit). */
export function nonCompliantTls(line: Line): boolean {
  return line.layer === 'integration' && NON_COMPLIANT_TLS.includes(line.tls ?? '');
}

type Keyed<T> = [key: string, item: T][];
/** Lines (or boxes) keyed by diagram and id: ids are unique on a diagram, not across a slot's diagrams. */
const linesOf = (content: DiagramContent | null): Keyed<Line> => (!content || 'notApplicable' in content ? [] : content.diagrams.flatMap((d) => d.lines.map((line): [string, Line] => [`${d.id}/${line.id}`, line])));
const boxesOf = (content: DiagramContent | null): Keyed<Box> => (!content || 'notApplicable' in content ? [] : content.diagrams.flatMap((d) => d.boxes.map((box): [string, Box] => [`${d.id}/${box.id}`, box])));

/**
 * Whether one view of a slot is answered for submit (counted in the section that edits it): the drawing view
 * needs a box on every diagram, its connection facts and (CI and CD flows) every approver; another view needs only
 * its own facts (the integration view: every integration connection's facts, and an API still in the inventory).
 */
export function viewAnswered(slot: DiagramSlot, view: DiagramView, content: DiagramContent, apis: ReadonlySet<string> = new Set()): boolean {
  // An integration connection's API must still be in the SAD's API inventory (`apis`: its row ids).
  const linked = (line: Line) => view !== 'integration' || !line.api || apis.has(line.api.id);
  const complete = linesOf(content).every(([, line]) => missingFacts(view, line).length === 0 && linked(line));
  if (view !== SLOT_OWNER[slot].view) return complete;
  return diagramAnswered(content) && complete && ('notApplicable' in content || approversNamed(content.diagrams));
}

const factsOf = (views: readonly DiagramView[]) => views.flatMap((view) => VIEW_FACTS[view] ?? []);
const omit = (line: Line, keys: readonly LineFact[]): Line => Object.fromEntries(Object.entries(line).filter(([key]) => !(keys as readonly string[]).includes(key))) as Line;
const pick = (line: Line, keys: readonly LineFact[]): Partial<Line> => Object.fromEntries(Object.entries(line).filter(([key]) => (keys as readonly string[]).includes(key)));

/** Infrastructure lines belong to the Infrastructure view, integration connections to the Integration view: each view shows only its own. */
const hiddenLine = (line: Line, views: readonly DiagramView[]) => views.includes(line.layer === 'integration' ? 'integration' : 'infrastructure');

/** The content without what the given views show (for a reader who cannot read their sections): their connection facts, or their lines. */
export function withoutFacts(content: DiagramContent, views: readonly DiagramView[]): DiagramContent {
  if ('notApplicable' in content || views.length === 0) return content;
  const keys = factsOf(views);
  return { ...content, diagrams: content.diagrams.map((d) => ({ ...d, lines: d.lines.filter((line) => !hiddenLine(line, views)).map((line) => omit(line, keys)) })) };
}

/**
 * Puts back, from what was stored, what the saver's sections do not show: facts of those views, and their lines
 * (except lines to a box or zone that is gone). What the saver sends for them is ignored, so hiding never erases or changes them.
 */
export function restoreFacts(before: DiagramContent | null, after: DiagramContent, views: readonly DiagramView[]): DiagramContent {
  if ('notApplicable' in after || views.length === 0) return after;
  const keys = factsOf(views);
  const stored = new Map(linesOf(before));
  const storedDiagrams = new Map(before && !('notApplicable' in before) ? before.diagrams.map((d) => [d.id, d]) : []);
  return {
    ...after,
    diagrams: after.diagrams.map((d) => {
      const ends = new Set([...d.zones, ...d.boxes].map((item) => item.id));
      const shown = d.lines
        .filter((line) => !hiddenLine(line, views))
        .map((line) => {
          const old = stored.get(`${d.id}/${line.id}`);
          return old ? { ...omit(line, keys), ...pick(old, keys) } : line;
        });
      const kept = (storedDiagrams.get(d.id)?.lines ?? []).filter((line) => hiddenLine(line, views) && ends.has(line.from) && ends.has(line.to));
      return { ...d, lines: [...shown, ...kept] };
    }),
  };
}

/** Other applications and external parties: either section 2 or section 3 editors place them on the infrastructure diagram. */
const sharedBox = (box: Box) => box.type === 'business' || box.type === 'external';
const integrationLines = (d: Diagram) => d.lines.filter((line) => line.layer === 'integration');

/** A zone without where it is and how big: what an automatically sized diagram works out from its boxes. */
const unplaced = ({ x: _x, y: _y, width: _width, height: _height, ...zone }: Zone) => zone;

/**
 * Section 3's part of the infrastructure diagram: everything but integration connections and the shared boxes. On a
 * diagram sized automatically, zone places and sizes follow the boxes, so they are not anyone's change.
 */
function infrastructurePart(content: DiagramContent): unknown {
  if ('notApplicable' in content) return content;
  return {
    ...content,
    diagrams: content.diagrams.map((d) => ({
      ...d,
      zones: d.sizing === 'auto' ? d.zones.map(unplaced) : d.zones,
      boxes: d.boxes.filter((box) => !sharedBox(box)),
      lines: d.lines.filter((line) => line.layer !== 'integration'),
    })),
  };
}

/**
 * Whether a save changes integration connections: one added or changed, or removed while both its boxes stay
 * (removing a box takes its connections with it). When section 3 asked for Copy from production, non-production
 * holding production's integration connections is that copy.
 */
function integrationChanged(before: DiagramContent, after: DiagramContent, copied: boolean): boolean {
  if ('notApplicable' in after) return false;
  const production = integrationLines(after.diagrams[0]);
  const stored = new Map('notApplicable' in before ? [] : before.diagrams.map((d) => [d.id, integrationLines(d)]));
  return after.diagrams.some((d) => {
    const now = integrationLines(d);
    if (copied && d.tab === 'non-production' && isDeepStrictEqual(now, production)) return false;
    const was = stored.get(d.id) ?? [];
    const boxes = new Set(d.boxes.map((box) => box.id));
    const changed = now.some((line) => !isDeepStrictEqual(line, was.find((old) => old.id === line.id)));
    const removed = was.some((old) => !now.some((line) => line.id === old.id) && boxes.has(old.from) && boxes.has(old.to));
    return changed || removed;
  });
}

/**
 * The views whose part a save changes. Solution diagram: another view's connection facts belong to that view (on
 * connections that stay or are added); everything else, removing connections included, to the drawing view.
 * Infrastructure diagram: integration connections to the Integration view; other applications and external
 * parties to neither (either section places them); everything else to the Infrastructure view. Key order is ignored.
 */
export function changedViews(slot: DiagramSlot, before: DiagramContent, after: DiagramContent, { copied = false }: { copied?: boolean } = {}): Set<DiagramView> {
  const changed = new Set<DiagramView>();
  if (slot === 'infrastructure') {
    if (!isDeepStrictEqual(infrastructurePart(before), infrastructurePart(after))) changed.add('infrastructure');
    if (integrationChanged(before, after, copied)) changed.add('integration');
    return changed;
  }
  const owner = SLOT_OWNER[slot].view;
  const others = SLOT_VIEWS[slot].filter((view) => view !== owner && VIEW_FACTS[view]);
  if (!isDeepStrictEqual(withoutFacts(before, others), withoutFacts(after, others))) changed.add(owner);
  const stored = new Map(linesOf(before));
  for (const view of others) {
    const keys = VIEW_FACTS[view]!;
    if (linesOf(after).some(([key, line]) => keys.some((fact) => line[fact] !== stored.get(key)?.[fact]))) changed.add(view);
  }
  return changed;
}

/**
 * Copy from production for an editor who cannot see integration connections: non-production takes production's
 * integration connections between the boxes it now holds (the copy keeps production's ids), instead of its own.
 */
export function copyIntegration(content: DiagramContent): DiagramContent {
  if ('notApplicable' in content) return content;
  // The infrastructure slot holds Production, then Non-production.
  const [production, nonProduction] = content.diagrams;
  const ends = new Set([...nonProduction.zones, ...nonProduction.boxes].map((item) => item.id));
  const copied = integrationLines(production).filter((line) => ends.has(line.from) && ends.has(line.to));
  return { ...content, diagrams: [production, { ...nonProduction, lines: [...nonProduction.lines.filter((line) => line.layer !== 'integration'), ...copied] }] };
}

/** What a reader cannot see of one diagram, for their editor: the ids of the lines left out, and the items that carry another view's lines or facts. */
export interface HiddenParts {
  diagramId: string;
  takenIds: string[];
  carriers: { id: string; view: DiagramView }[];
}

/**
 * For an editor whose sections do not show some views: the ids of the lines left out (new items must not take them),
 * and which items they see carry lines or facts of those views (removing them takes those too, so they are asked first).
 */
export function hiddenParts(content: DiagramContent, views: readonly DiagramView[]): HiddenParts[] {
  if ('notApplicable' in content || views.length === 0) return [];
  const keys = factsOf(views);
  return content.diagrams.map((d) => {
    const carriers: HiddenParts['carriers'] = [];
    const add = (id: string, view: DiagramView) => {
      if (!carriers.some((carrier) => carrier.id === id && carrier.view === view)) carriers.push({ id, view });
    };
    const left = d.lines.filter((line) => hiddenLine(line, views));
    for (const line of left) {
      const view = line.layer === 'integration' ? 'integration' : 'infrastructure';
      add(line.from, view);
      add(line.to, view);
    }
    for (const line of d.lines.filter((item) => !hiddenLine(item, views))) {
      for (const view of views) if ((VIEW_FACTS[view] ?? []).some((fact) => keys.includes(fact) && line[fact] !== undefined)) add(line.id, view);
    }
    return { diagramId: d.id, takenIds: left.map((line) => line.id), carriers };
  });
}

/** Integration connections newly linked to an API (added, or linked to another one), with where they are for error messages. */
export function newApiLinks(before: DiagramContent | null, after: DiagramContent): { path: (string | number)[]; id: string }[] {
  if ('notApplicable' in after) return [];
  const stored = new Map(linesOf(before));
  return after.diagrams.flatMap((d, di) =>
    d.lines.flatMap((line, li) => (line.api && stored.get(`${d.id}/${line.id}`)?.api?.id !== line.api.id ? [{ path: ['diagrams', di, 'lines', li, 'api', 'id'], id: line.api.id }] : [])),
  );
}

/** What a box links to in TRM: a business application (solution and infrastructure diagrams) or a server (infrastructure). */
export type TrmLink = 'application' | 'server';

/** Boxes newly linked to TRM (added, or linked to another record), with where they are for error messages. */
export function newPicks(before: DiagramContent | null, after: DiagramContent, link: TrmLink = 'application'): { path: (string | number)[]; id: string }[] {
  if ('notApplicable' in after) return [];
  const stored = new Map(boxesOf(before));
  return after.diagrams.flatMap((d, di) =>
    d.boxes.flatMap((box, bi) => {
      const linked = box[link];
      return linked && stored.get(`${d.id}/${box.id}`)?.[link]?.id !== linked.id ? [{ path: ['diagrams', di, 'boxes', bi, link, 'id'], id: linked.id }] : [];
    }),
  );
}

/**
 * A box keeps the TRM name (and APM number) it was picked with: one still linked to the same record keeps what was
 * stored (the author cannot type over it), and a new pick takes TRM's current values from `picks`.
 */
export function settlePicks(
  before: DiagramContent | null,
  after: DiagramContent,
  picks: Map<string, { name: string; number: string | null }>,
  link: TrmLink = 'application',
): DiagramContent {
  if ('notApplicable' in after) return after;
  const stored = new Map(boxesOf(before));
  const linkTo = (id: string, number: string | null) => (link === 'application' ? { application: { id, number } } : { server: { id } });
  return {
    ...after,
    diagrams: after.diagrams.map((d) => ({
      ...d,
      boxes: d.boxes.map((box) => {
        const linked = box[link];
        if (!linked) return box;
        const old = stored.get(`${d.id}/${box.id}`);
        const current = picks.get(linked.id);
        const sentNumber = link === 'application' ? (box.application!.number ?? null) : null;
        // Picked again: the name and number sent are TRM's current ones (just saving sends what was picked before).
        const repicked = current !== undefined && box.label === current.name && sentNumber === current.number;
        if (old?.[link]?.id === linked.id && !repicked) return { ...box, label: old.label, [link]: old[link] };
        return { ...box, label: current!.name, ...linkTo(linked.id, current!.number) };
      }),
    })),
  };
}

const page = (id: string, title: string, tab?: Diagram['tab']): Diagram => ({ id, title, ...(tab ? { tab } : {}), sizing: 'auto', zones: [], boxes: [], lines: [] });

const THIS_APPLICATION = 'This application';
/** The grouping box for the application's own parts, sized like an empty zone in the editor (its automatic size). */
const applicationZone = (name: string): Zone => {
  const label = name.slice(0, 200);
  return { id: 'zone-1', label, kind: THIS_APPLICATION, x: 0, y: 0, width: emptyZoneWidth(label, THIS_APPLICATION), height: 40 };
};

/**
 * What a slot holds before anyone draws in it: the solution diagram starts with a box named after the application,
 * the infrastructure diagram with the hosting settings and its fixed zones on both tabs. New diagrams size their
 * zones automatically.
 */
export function emptyContent(slot: DiagramSlot, application?: string | null, hosting: Hosting = DEFAULT_HOSTING): { diagrams: Diagram[]; hosting?: Hosting } {
  switch (slot) {
    case 'solution':
      return { diagrams: [{ ...page('solution', 'Solution diagram'), zones: application ? [applicationZone(application)] : [] }] };
    case 'infrastructure':
      return {
        // A copy: the caller may change it, never the defaults.
        hosting: { ...hosting },
        diagrams: [
          { ...page('production', 'Production', 'production'), zones: fixedZones(hosting) },
          { ...page('non-production', 'Non-production', 'non-production'), zones: fixedZones(hosting) },
        ],
      };
    case 'ci-cd':
      return { diagrams: [page('ci-cd-1', 'CI and CD flow')] };
    case 'monitoring':
      return { diagrams: [page('monitoring-1', 'Monitoring')] };
  }
}
