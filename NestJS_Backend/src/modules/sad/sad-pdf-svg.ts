import type { BLOCK_TYPES, Box, Diagram, DiagramSlot, DiagramView, Line, SIDES } from './domain/diagrams.js';
import type { MONITORING_BLOCKS } from './domain/monitoring.js';
import { PROCESS_STEPS } from './domain/process.js';
import type { IconSvg } from './sad-pdf-icons.js';
import { boxKind, lineLabel, zoneKind } from './sad-pdf-labels.js';

/**
 * A SAD diagram drawn by the server as SVG for the PDF (docs/modules/sad.md, PDF): the canvas's zones, boxes, steps
 * and lines from the diagram data, in the web app's sizes (boxes 176 × 64), light colours and English words.
 */

type Side = (typeof SIDES)[number];
interface Point {
  x: number;
  y: number;
}
interface Rect extends Point {
  w: number;
  h: number;
}
export interface DiagramPicture {
  svg: string;
  width: number;
  height: number;
}

const BOX_WIDTH = 176;
const BOX_HEIGHT = 64;
/** Room around the drawing */
const PAD = 24;
/** How far a line runs straight out of its side before bending */
const OUT = 20;
/** The most room between lines that share sides, and what they leave clear at each end of a side (as on the canvas). */
const SPREAD = 32;
const SIDE_MARGIN = 8;
const INK = '#1F1F1F';
const SUBDUED = '#5E5E5E';
const LINE = '#3D3D3D';
const BORDER = '#BDBDBD';
const BOLD_BORDER = '#8A8A8A';
const PAPER = '#FFFFFF';
const ZONE_FILL = '#EDEDED';
const NOTHING = 'Nothing drawn yet.';

// ----- Text

const NARROW = new Set("iljtfr.,:;|!'()[] ");
const WIDE = new Set('mwMW@%');

/** Roughly how wide text is in Roboto, erring wide so it stays inside its box. */
export function textWidth(text: string, size: number, bold = false): number {
  let em = 0;
  for (const char of text) em += NARROW.has(char) ? 0.32 : WIDE.has(char) ? 0.88 : /[A-Z]/.test(char) ? 0.68 : /\d/.test(char) ? 0.58 : 0.55;
  return em * size * (bold ? 1.06 : 1);
}

/** The line cut to the width, ending with "…" (always when more text follows). */
function cut(line: string, width: number, size: number, bold: boolean, more: boolean): string {
  if (!more && textWidth(line, size, bold) <= width) return line;
  let kept = line;
  while (kept.length > 0 && textWidth(`${kept}…`, size, bold) > width) kept = kept.slice(0, -1);
  return `${kept.trimEnd()}…`;
}

/** Text wrapped at spaces onto at most `lines` lines of the width: a word too long for a line is cut, and text left over ends the last line with "…". */
export function wrap(text: string, width: number, size: number, bold: boolean, lines: number): string[] {
  const wrapped: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (!current || textWidth(next, size, bold) <= width) current = next;
    else {
      wrapped.push(current);
      current = word;
    }
  }
  if (current) wrapped.push(current);
  const kept = wrapped.slice(0, lines);
  return kept.map((line, index) => cut(line, width, size, bold, wrapped.length > lines && index === kept.length - 1));
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const num = (value: number) => String(Math.round(value * 10) / 10);

interface TextStyle {
  size: number;
  bold?: boolean;
  italic?: boolean;
  fill?: string;
  anchor?: 'middle';
}
function text(x: number, y: number, value: string, { size, bold, italic, fill = INK, anchor }: TextStyle): string {
  const style = `${bold ? ' font-weight="bold"' : ''}${italic ? ' font-style="italic"' : ''}${anchor ? ` text-anchor="${anchor}"` : ''}`;
  return `<text x="${num(x)}" y="${num(y)}" font-family="Roboto" font-size="${size}"${style} fill="${fill}">${esc(value)}</text>`;
}

/** A warning sign (amber with a dark outline and "!", as RAG amber needs), its top-left corner at x, y. */
const warning = (x: number, y: number) =>
  `<polygon points="${num(x + 6)},${num(y)} ${num(x + 12)},${num(y + 11)} ${num(x)},${num(y + 11)}" fill="#F5B400" stroke="#5C4300" stroke-width="1"/>${text(x + 6, y + 10, '!', { size: 8, bold: true, anchor: 'middle' })}`;

// ----- Shapes (the web app's ShapeIcon pictures, on a 24 × 24 grid)

const SHAPE_PATHS: Record<string, string> = {
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  external: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  server: '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M8 6.5h.01M8 17.5h.01"/>',
  api: '<path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 2.5-2 3 1 .5 2 1.5 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.5 1 2.5 2 3-1 .5-2 1.5-2 3v2c0 2-1 3-3 3"/>',
  worker: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  queue: '<path d="M4 6h16M4 12h16M4 18h16M8 3v18"/>',
  storage: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  'on-prem': '<path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01"/>',
  firewall: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  vpn: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  monitoring: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M6 11h3l1.5-3 2.5 6 1.5-3H18M9 21h6M12 17v4"/>',
  approval:
    '<path d="M12 2.5l2.3 1.7 2.9-.1.9 2.7 2.3 1.7-.9 2.7.9 2.7-2.3 1.7-.9 2.7-2.9-.1L12 21.5l-2.3-1.7-2.9.1-.9-2.7-2.3-1.7.9-2.7-.9-2.7 2.3-1.7.9-2.7 2.9.1z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
};
// Web and anything without its own picture: a window.
const WINDOW = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 13h6M7 16h10"/>';
/** The shape each solution and monitoring block is drawn with (other boxes are named by their shape). */
const BLOCK_SHAPE: Record<(typeof BLOCK_TYPES)[number] | (typeof MONITORING_BLOCKS)[number], string> = {
  actor: 'person',
  part: 'worker',
  business: 'web',
  external: 'external',
  monitoring: 'monitoring',
  system: 'web',
  team: 'person',
};

const shapeIcon = (shape: string, x: number, y: number, size: number) =>
  `<g transform="translate(${num(x)} ${num(y)}) scale(${num(size / 24)})" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${SHAPE_PATHS[shape] ?? WINDOW}</g>`;
const azureIcon = (icon: IconSvg, x: number, y: number, size: number) => `<svg x="${num(x)}" y="${num(y)}" width="${size}" height="${size}" viewBox="${icon.viewBox}">${icon.body}</svg>`;
const rect = (r: Rect, radius: number, stroke: string, extra = '') =>
  `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" rx="${radius}" fill="${PAPER}" stroke="${stroke}" stroke-width="1"${extra}/>`;

type Icons = (id: string) => IconSvg | null;

/** A block: its Azure icon or shape on the left, its name (two lines at most) and kind beside it. */
function drawBox(box: Box, at: Rect, kind: string, icons: Icons): string {
  const shape = Object.hasOwn(BLOCK_SHAPE, box.type) ? BLOCK_SHAPE[box.type as keyof typeof BLOCK_SHAPE] : box.type;
  const external = shape === 'external';
  const icon = box.icon ? icons(box.icon) : null;
  const names = wrap(box.label, 112, 14, true, 2);
  const top = at.y + (BOX_HEIGHT - (names.length * 17 + 15)) / 2;
  return [
    rect(at, shape === 'person' ? 32 : 8, external ? BOLD_BORDER : BORDER, external ? ' stroke-dasharray="4 3"' : ''),
    icon ? azureIcon(icon, at.x + 12, at.y + 16, 32) : shapeIcon(shape, at.x + 14, at.y + 18, 28),
    ...names.map((name, index) => text(at.x + 52, top + 13 + index * 17, name, { size: 14, bold: true })),
    text(at.x + 52, top + names.length * 17 + 12, wrap(kind, 112, 12, false, 1)[0], { size: 12, fill: SUBDUED }),
  ].join('');
}

/** A CI or CD step by kind: Start and End rounded, Step a box, Decision a diamond, Approval double-bordered with a seal. */
function drawStep(box: Box, at: Rect, kind: string, icons: Icons): string {
  const { x, y } = at;
  const decision = box.type === 'decision';
  const ends = box.type === 'start' || box.type === 'end';
  const unnamed = box.type === 'approval' && !box.approver;
  const icon = box.icon ? icons(box.icon) : null;
  const shapes = decision
    ? `<polygon points="${x + 88},${y + 1} ${x + 175},${y + 32} ${x + 88},${y + 63} ${x + 1},${y + 32}" fill="${PAPER}" stroke="${BOLD_BORDER}" stroke-width="1.5"/>`
    : rect(at, ends ? 32 : 8, ends || box.type === 'approval' ? BOLD_BORDER : BORDER) + (box.type === 'approval' ? rect({ x: x + 3, y: y + 3, w: BOX_WIDTH - 6, h: BOX_HEIGHT - 6 }, 6, BOLD_BORDER) : '');
  const pictured = icon !== null || box.type === 'approval';
  const picture = icon ? azureIcon(icon, x + 16, y + 20, 24) : box.type === 'approval' ? shapeIcon('approval', x + 16, y + 20, 24) : '';
  const left = x + 16 + (pictured ? 32 : 0);
  const width = x + BOX_WIDTH - 16 - left;
  const middle = left + width / 2;
  const size = decision ? 12 : 14;
  const names = wrap(box.label, width, size, true, 2);
  const top = y + (BOX_HEIGHT - (names.length * (size + 3) + 15)) / 2;
  const kindLine = wrap(kind, unnamed ? width - 16 : width, 12, false, 1)[0];
  const kindY = top + names.length * (size + 3) + 12;
  const kindStart = middle - textWidth(kindLine, 12) / 2 + (unnamed ? 8 : 0);
  return [
    shapes,
    picture,
    ...names.map((name, index) => text(middle, top + size - 1 + index * (size + 3), name, { size, bold: true, anchor: 'middle' })),
    unnamed ? warning(kindStart - 16, kindY - 10) : '',
    text(unnamed ? kindStart + textWidth(kindLine, 12) / 2 : middle, kindY, kindLine, { size: 12, fill: SUBDUED, anchor: 'middle' }),
  ].join('');
}

// ----- Lines

const OUTWARD: Record<Side, Point> = { t: { x: 0, y: -1 }, r: { x: 1, y: 0 }, b: { x: 0, y: 1 }, l: { x: -1, y: 0 } };
const across = (side: Side) => side === 'l' || side === 'r';

/** The sides a line leaves and enters: the author's choice, else facing each other along the longer distance (as on the canvas). */
function sidesOf(line: Line, a: Rect, b: Rect): [Side, Side] {
  if (line.fromSide && line.toSide) return [line.fromSide, line.toSide];
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['r', 'l'] : ['l', 'r'];
  return dy > 0 ? ['b', 't'] : ['t', 'b'];
}

interface Spread {
  offset: number;
  at: number;
}
/** Lines between the same sides of the same two things, spread evenly across the shorter side and bending at different places (as on the canvas). */
function spreads(lines: Line[], sides: [Side, Side][], rects: Map<string, Rect>): Spread[] {
  const end = (id: string, side: Side) => `${id}:${side}`;
  const keys = lines.map((line, index) => [end(line.from, sides[index][0]), end(line.to, sides[index][1])].sort().join(' '));
  const sideLength = (id: string, side: Side) => (across(side) ? rects.get(id)!.h : rects.get(id)!.w);
  return lines.map((line, index) => {
    const group = keys.flatMap((key, other) => (key === keys[index] ? [other] : []));
    if (group.length === 1) return { offset: 0, at: 0.5 };
    const [from, to] = sides[index];
    const room = Math.min(sideLength(line.from, from), sideLength(line.to, to)) - 2 * SIDE_MARGIN;
    const step = Math.min(SPREAD, room / (group.length - 1));
    const place = group.indexOf(index);
    const along = (place + 0.5) / group.length;
    return { offset: (place - (group.length - 1) / 2) * step, at: end(line.from, from) < end(line.to, to) ? along : 1 - along };
  });
}

/** Where a line meets a side: its middle, moved along the side by the spread's offset. */
function anchor(r: Rect, side: Side, offset: number): Point {
  if (side === 't' || side === 'b') return { x: r.x + r.w / 2 + offset, y: side === 't' ? r.y : r.y + r.h };
  return { x: side === 'l' ? r.x : r.x + r.w, y: r.y + r.h / 2 + offset };
}

const plus = (p: Point, d: Point, by: number): Point => ({ x: p.x + d.x * by, y: p.y + d.y * by });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/**
 * The bends between a line's ends, at right angles: straight out of each side, then across. Sides facing each other bend
 * at `at` of the way between the ends (as React Flow's step lines do); sides facing the same way go round the outer one.
 */
function bends(s: Point, from: Side, t: Point, to: Side, at: number): Point[] {
  const s1 = plus(s, OUTWARD[from], OUT);
  const t1 = plus(t, OUTWARD[to], OUT);
  if (across(from) === across(to)) {
    const axis = across(from) ? 'x' : 'y';
    const other = axis === 'x' ? 'y' : 'x';
    const point = (main: number, side: Point): Point => (axis === 'x' ? { x: main, y: side.y } : { x: side.x, y: main });
    const facing = from !== to && dot(OUTWARD[from], minus(t, s)) >= 0;
    if (facing) {
      const middle = s[axis] + (t[axis] - s[axis]) * at;
      return [s, s1, point(middle, s1), point(middle, t1), t1, t];
    }
    if (from === to) {
      const outer = dot(OUTWARD[from], { x: 1, y: 1 }) > 0 ? Math.max(s1[axis], t1[axis]) : Math.min(s1[axis], t1[axis]);
      return [s, point(outer, s), point(outer, t), t];
    }
    // Facing away from each other: out of each side, then across between them.
    const middle = (s1[other] + t1[other]) / 2;
    const cross = (p: Point): Point => (axis === 'x' ? { x: p.x, y: middle } : { x: middle, y: p.y });
    return [s, s1, cross(s1), cross(t1), t1, t];
  }
  // One side across, the other up or down: one corner, where both lines run outwards if it can.
  const corner = across(from) ? { x: t1.x, y: s1.y } : { x: s1.x, y: t1.y };
  const outwards = dot(OUTWARD[from], minus(corner, s1)) >= 0 && dot(OUTWARD[to], minus(corner, t1)) >= 0;
  return [s, s1, outwards ? corner : across(from) ? { x: s1.x, y: t1.y } : { x: t1.x, y: s1.y }, t1, t];
}

/** Without repeated points or points in the middle of a straight run. */
function simplify(points: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    const before = kept[kept.length - 2];
    if (before && ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y))) kept.pop();
    kept.push(point);
  }
  return kept;
}

/** The point halfway along the line (at least two points), where its label goes. */
function halfway(points: Point[]): Point {
  const lengths = points.slice(1).map((point, index) => Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y));
  let left = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let at = 0;
  while (at < lengths.length - 1 && left > lengths[at]) left -= lengths[at++];
  const [from, to] = [points[at], points[at + 1]];
  return plus(from, { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) }, left);
}

/** An arrowhead pointing into a side at `tip`. */
function arrow(tip: Point, side: Side): string {
  const into = { x: -OUTWARD[side].x, y: -OUTWARD[side].y };
  const base = plus(tip, into, -8);
  const normal = { x: into.y, y: -into.x };
  const corners = [tip, plus(base, normal, 4.5), plus(base, normal, -4.5)];
  return `<polygon points="${corners.map((p) => `${num(p.x)},${num(p.y)}`).join(' ')}" fill="${LINE}"/>`;
}

/** A line's label in a white box (three lines at most), with a warning sign when it needs one. */
function labelBox(at: Point, label: string, warn: boolean): { svg: string; box: Rect } {
  const lines = wrap(label, 212, 12, false, 3);
  const inset = warn ? 16 : 0;
  const w = Math.max(...lines.map((line) => textWidth(line, 12))) + 12 + inset;
  const h = lines.length * 15 + 6;
  const box = { x: at.x - w / 2, y: at.y - h / 2, w, h };
  return {
    box,
    svg: [
      `<rect x="${num(box.x)}" y="${num(box.y)}" width="${num(w)}" height="${num(h)}" rx="4" fill="${PAPER}" stroke="${BORDER}" stroke-width="1"/>`,
      warn ? warning(box.x + 6, box.y + 4) : '',
      ...lines.map((line, index) => text(box.x + 6 + inset, box.y + 15 + index * 15, line, { size: 12 })),
    ].join(''),
  };
}

// ----- The diagram

/** Where each zone and box is on the drawing (positions are relative to the zone holding them). */
function placesOf(diagram: Diagram): Map<string, Rect> {
  const places = new Map<string, Rect>();
  const items = new Map<string, { item: Diagram['zones'][number] | Box; size: { w: number; h: number } }>([
    ...diagram.zones.map((zone) => [zone.id, { item: zone, size: { w: zone.width, h: zone.height } }] as const),
    ...diagram.boxes.map((box) => [box.id, { item: box, size: { w: BOX_WIDTH, h: BOX_HEIGHT } }] as const),
  ]);
  const place = (id: string): Rect => {
    const known = places.get(id);
    if (known) return known;
    const { item, size } = items.get(id)!;
    const parent = item.parentId ? place(item.parentId) : { x: 0, y: 0 };
    const at = { x: parent.x + item.x, y: parent.y + item.y, ...size };
    places.set(id, at);
    return at;
  };
  for (const id of items.keys()) place(id);
  return places;
}

/**
 * One diagram in one view as SVG, with its size. The infrastructure diagram shows only the view's own lines
 * (integration connections in the Integration view, infrastructure lines in the Infrastructure view).
 */
export function diagramSvg(diagram: Diagram, slot: DiagramSlot, view: DiagramView, icons: Icons): DiagramPicture {
  if (diagram.zones.length === 0 && diagram.boxes.length === 0) {
    const empty = { width: 360, height: 60 };
    return { ...empty, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${empty.width}" height="${empty.height}" viewBox="0 0 ${empty.width} ${empty.height}">${text(PAD, 36, NOTHING, { size: 14, italic: true, fill: SUBDUED })}</svg>` };
  }
  const places = placesOf(diagram);
  const lines = slot === 'infrastructure' ? diagram.lines.filter((line) => (line.layer === 'integration') === (view === 'integration')) : diagram.lines;
  const holders = new Set([...diagram.zones, ...diagram.boxes].map((item) => item.parentId));
  const depth = (id: string | undefined): number => (id === undefined ? 0 : 1 + depth(diagram.zones.find((zone) => zone.id === id)!.parentId));
  const zones = [...diagram.zones].sort((a, b) => depth(a.parentId) - depth(b.parentId)).map((zone) => {
    const at = places.get(zone.id)!;
    const kind = zoneKind(zone.kind);
    const nameWidth = textWidth(zone.label, 14, true);
    const kindWidth = kind ? textWidth(kind, 12) + 8 : 0;
    return [
      `<rect x="${num(at.x)}" y="${num(at.y)}" width="${num(at.w)}" height="${num(at.h)}" rx="8" fill="${ZONE_FILL}" fill-opacity="0.6" stroke="${BOLD_BORDER}" stroke-width="2" stroke-dasharray="6 4"/>`,
      text(at.x + 12, at.y + 20, zone.label, { size: 14, bold: true }),
      kind ? text(at.x + 20 + nameWidth, at.y + 20, kind, { size: 12, fill: SUBDUED }) : '',
      holders.has(zone.id) ? '' : text(at.x + 20 + nameWidth + kindWidth, at.y + 20, `· ${NOTHING}`, { size: 12, italic: true, fill: SUBDUED }),
    ].join('');
  });
  const boxes = diagram.boxes.map((box) => {
    const at = places.get(box.id)!;
    const kind = boxKind(slot, box);
    return (PROCESS_STEPS as readonly string[]).includes(box.type) ? drawStep(box, at, kind, icons) : drawBox(box, at, kind, icons);
  });
  const sides = lines.map((line) => sidesOf(line, places.get(line.from)!, places.get(line.to)!));
  const spread = spreads(lines, sides, places);
  const labels: { svg: string; box: Rect }[] = [];
  const drawn = lines.map((line, index) => {
    const [from, to] = sides[index];
    const s = anchor(places.get(line.from)!, from, spread[index].offset);
    const t = anchor(places.get(line.to)!, to, spread[index].offset);
    const points = simplify(bends(s, from, t, to, spread[index].at));
    const shown = lineLabel(view, line);
    if (shown.label) labels.push(labelBox(halfway(points), shown.label, shown.missing || shown.nonCompliant === true));
    return [
      `<path d="${points.map((p, at) => `${at === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join(' ')}" fill="none" stroke="${LINE}" stroke-width="1.5"${line.dashed ? ' stroke-dasharray="6 4"' : ''}/>`,
      arrow(t, to),
      line.twoWay ? arrow(s, from) : '',
    ].join('');
  });
  const all = [...places.values(), ...labels.map((label) => label.box)];
  const left = Math.min(...all.map((r) => r.x));
  const top = Math.min(...all.map((r) => r.y));
  const width = Math.ceil(Math.max(...all.map((r) => r.x + r.w)) - left + 2 * PAD);
  const height = Math.ceil(Math.max(...all.map((r) => r.y + r.h)) - top + 2 * PAD);
  const body = [...zones, ...drawn, ...boxes, ...labels.map((label) => label.svg)].join('');
  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${num(PAD - left)} ${num(PAD - top)})">${body}</g></svg>`,
  };
}
