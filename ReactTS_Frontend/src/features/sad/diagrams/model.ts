import type {
  Box,
  Diagram,
  DiagramContent,
  DiagramSlot,
  DiagramView,
  Hosting,
  Line,
  Zone,
} from "../schemas";
import { DEFAULT_HOSTING, emptyZoneWidth, fixedZones } from "./infrastructure";

/** Boxes have a fixed size on the canvas, so zones can be sized around them without measuring. */
export const BOX_WIDTH = 176;
export const BOX_HEIGHT = 64;
export const EMPTY_ZONE_HEIGHT = 40;
const NEW_ZONE = { width: 300, height: 160 };
/** Room a zone keeps right of and below what it holds, and between neighbours. */
const PAD = 20;
const GAP = 30;
/** Where a zone's contents start (under its name), and how wide a row of them gets before the next item wraps. */
const INSET = { x: 20, y: 40 };
const ROW = 800;
/** How close to its zone's top and left React Flow lets a dragged item go; past the right and bottom the zone grows. */
export const INSIDE_MIN = { x: 8, y: 30 };

type Content = { diagrams: Diagram[]; hosting?: Hosting };

export function emptyDiagram(id: string, title: string): Diagram {
  return { id, title, sizing: "auto", zones: [], boxes: [], lines: [] };
}

const THIS_APPLICATION = "This application";
/** The grouping box for the application's own parts, at an empty zone's automatic size (as the API makes it). */
function applicationZone(name: string): Zone {
  const label = name.slice(0, 200);
  return {
    id: "zone-1",
    label,
    kind: THIS_APPLICATION,
    x: 0,
    y: 0,
    width: emptyZoneWidth(label, THIS_APPLICATION),
    height: EMPTY_ZONE_HEIGHT,
  };
}

/**
 * What a slot holds before anyone draws in it (the same as the API's): the solution diagram starts with the
 * application's grouping box, the infrastructure diagram with the hosting settings and its fixed zones.
 */
export function emptyContent(
  slot: DiagramSlot,
  application?: string | null,
  hosting: Hosting = DEFAULT_HOSTING,
): Content {
  switch (slot) {
    case "solution":
      return {
        diagrams: [
          {
            ...emptyDiagram("solution", "Solution diagram"),
            zones: application ? [applicationZone(application)] : [],
          },
        ],
      };
    case "infrastructure":
      return {
        hosting: { ...hosting },
        diagrams: [
          {
            ...emptyDiagram("production", "Production"),
            tab: "production",
            zones: fixedZones(hosting),
          },
          {
            ...emptyDiagram("non-production", "Non-production"),
            tab: "non-production",
            zones: fixedZones(hosting),
          },
        ],
      };
    case "ci-cd":
      return { diagrams: [emptyDiagram("ci-cd-1", "CI and CD flow")] };
    case "monitoring":
      return { diagrams: [emptyDiagram("monitoring-1", "Monitoring")] };
  }
}

/** The next "<prefix>-<n>" after the highest one on the diagram. */
function nextId(prefix: string, ids: string[]): string {
  const taken = ids
    .map((id) => new RegExp(`^${prefix}-(\\d+)$`).exec(id)?.[1])
    .filter((n): n is string => n !== undefined);
  return `${prefix}-${Math.max(0, ...taken.map(Number)) + 1}`;
}
/** Ids in use, and those a new item must not take (lines the editor cannot see, saved items removed since). */
const allIds = (d: Diagram) =>
  [...d.zones, ...d.boxes, ...d.lines]
    .map((item) => item.id)
    .concat(d.taken ?? []);

type Area = { x: number; y: number; w: number; h: number };
const areaOf = (item: Zone | Box): Area =>
  "width" in item
    ? { x: item.x, y: item.y, w: item.width, h: item.height }
    : { x: item.x, y: item.y, w: BOX_WIDTH, h: BOX_HEIGHT };
/** Whether two neighbours keep the gap between them. */
const apart = (a: Area, b: Area) =>
  a.x + a.w + GAP <= b.x ||
  b.x + b.w + GAP <= a.x ||
  a.y + a.h + GAP <= b.y ||
  b.y + b.h + GAP <= a.y;

/**
 * Where a new or moved zone or box of size w × h goes. At the top level: below everything. Inside a zone: its first free
 * slot, row by row (a row wraps before it passes 800px, and an item wider than that has a row of its own); zones come
 * first, so a zone looks only among the zones and a box goes in the rows under them.
 */
function freeSpot(
  d: Diagram,
  parentId: string | undefined,
  { w, h }: { w: number; h: number },
  zone: boolean,
): { x: number; y: number } {
  const inside = [...d.zones, ...d.boxes].filter(
    (item) => item.parentId === parentId,
  );
  if (parentId === undefined) {
    const bottom = (item: Zone | Box) =>
      item.y + ("height" in item ? item.height : BOX_HEIGHT);
    return inside.length === 0
      ? { x: 0, y: 0 }
      : { x: 0, y: Math.max(...inside.map(bottom)) + GAP };
  }
  const zones = inside
    .filter((item): item is Zone => "width" in item)
    .map(areaOf);
  const taken = zone ? zones : inside.map(areaOf);
  const top =
    zone || zones.length === 0
      ? INSET.y
      : Math.max(...zones.map((area) => area.y + area.h)) + GAP;
  const xs = [
    ...new Set([INSET.x, ...taken.map((area) => area.x + area.w + GAP)]),
  ].sort((a, b) => a - b);
  const ys = [...new Set([top, ...taken.map((area) => area.y + area.h + GAP)])]
    .filter((y) => y >= top)
    .sort((a, b) => a - b);
  const slots = ys.flatMap((y) =>
    xs
      .filter((x) => x === INSET.x || x + w <= INSET.x + ROW)
      .map((x) => ({ x, y, w, h })),
  );
  // The start of the row under everything is always free.
  const slot = slots.find((area) =>
    taken.every((other) => apart(area, other)),
  )!;
  return { x: slot.x, y: slot.y };
}

const BOX = { w: BOX_WIDTH, h: BOX_HEIGHT };
/** A new zone's size once placed: sized automatically it shrinks to its name. */
const newZoneSize = (d: Diagram, label: string, kind: string | undefined) =>
  d.sizing === "auto"
    ? { w: emptyZoneWidth(label.trim(), kind?.trim()), h: EMPTY_ZONE_HEIGHT }
    : { w: NEW_ZONE.width, h: NEW_ZONE.height };

/** Optional text fields are left out when blank (kept as typed otherwise: trimming while typing would eat spaces). */
export function withText<T extends object>(
  item: T,
  key: string,
  value: string | undefined,
): T {
  const next = { ...item } as Record<string, unknown>;
  if (value === undefined || value.trim() === "") delete next[key];
  else next[key] = value;
  return next as T;
}

export function addZone(
  d: Diagram,
  {
    label,
    kind,
    parentId,
  }: { label: string; kind?: string; parentId?: string },
  at = freeSpot(d, parentId, newZoneSize(d, label, kind), true),
): Diagram {
  const zone: Zone = withText(
    {
      id: nextId("zone", allIds(d)),
      label: label.trim(),
      ...(parentId ? { parentId } : {}),
      ...at,
      ...NEW_ZONE,
    },
    "kind",
    kind?.trim(),
  );
  return { ...d, zones: [...d.zones, zone] };
}

type NewBox = {
  label: string;
  type: string;
  parentId?: string;
  application?: Box["application"];
  server?: Box["server"];
  icon?: string;
};

/** Adds a box at `at`, or at a free spot in its zone (or below everything). */
export function addBox(
  d: Diagram,
  { label, type, parentId, application, server, icon }: NewBox,
  at = freeSpot(d, parentId, BOX, false),
): Diagram {
  const links = {
    ...(application ? { application } : {}),
    ...(server ? { server } : {}),
    ...(icon ? { icon } : {}),
  };
  const box: Box = {
    id: nextId("box", allIds(d)),
    label: label.trim(),
    type,
    ...links,
    ...(parentId ? { parentId } : {}),
    ...at,
  };
  return { ...d, boxes: [...d.boxes, box] };
}

/** Solution diagram columns: actors left of everything, other applications and external parties right of it (as in the agreed prototype). */
const COLUMN: Partial<Record<string, "left" | "right">> = {
  actor: "left",
  business: "right",
  external: "right",
};
const COLUMN_GAP = 120;

/** Where a new top-level block of a column goes: below the column's last block, or beside everything else. */
function columnSpot(
  d: Diagram,
  column: "left" | "right",
): { x: number; y: number } {
  const top = [...d.zones, ...d.boxes].filter(
    (item) => item.parentId === undefined,
  );
  const inColumn = (item: Zone | Box) =>
    "type" in item && COLUMN[item.type] === column;
  const members = top.filter(inColumn);
  if (members.length > 0)
    return {
      x: members[0].x,
      y: Math.max(...members.map((member) => member.y)) + BOX_HEIGHT + GAP,
    };
  const others = top.filter((item) => !inColumn(item));
  if (others.length === 0) return { x: 0, y: 0 };
  const y = Math.min(...others.map((item) => item.y));
  if (column === "left")
    return {
      x: Math.min(...others.map((item) => item.x)) - BOX_WIDTH - COLUMN_GAP,
      y,
    };
  return {
    x:
      Math.max(
        ...others.map(
          (item) => item.x + ("width" in item ? item.width : BOX_WIDTH),
        ),
      ) + COLUMN_GAP,
    y,
  };
}

/** Adds a solution diagram block: a part into its grouping box, the others into their column. */
export function addBlock(d: Diagram, block: NewBox): Diagram {
  const column = block.parentId === undefined ? COLUMN[block.type] : undefined;
  return column ? addBox(d, block, columnSpot(d, column)) : addBox(d, block);
}

type LineText =
  | "label"
  | "calls"
  | "does"
  | "data"
  | "frequency"
  | "protocol"
  | "protection"
  | "authentication"
  | "purpose";
const LINE_TEXT: LineText[] = [
  "label",
  "calls",
  "does",
  "data",
  "frequency",
  "protocol",
  "protection",
  "authentication",
  "purpose",
];
/** Choices and numbers left out when cleared. */
const LINE_CHOICES = [
  "classification",
  "port",
  "tls",
  "pattern",
  "flow",
  "api",
] as const;

export function addLine(
  d: Diagram,
  {
    from,
    to,
    dashed,
    twoWay,
    ...text
  }: { from: string; to: string; dashed?: boolean; twoWay?: boolean } & Partial<
    Record<"label" | "calls" | "does", string>
  >,
): Diagram {
  let line: Line = {
    id: nextId("line", allIds(d)),
    from,
    to,
    ...(dashed ? { dashed } : {}),
    ...(twoWay ? { twoWay } : {}),
  };
  for (const key of ["label", "calls", "does"] as const)
    line = withText(line, key, text[key]?.trim());
  return { ...d, lines: [...d.lines, line] };
}

/** True when `zoneId` is `ancestor` or sits inside it (at any depth). */
function within(
  d: Diagram,
  zoneId: string | undefined,
  ancestor: string,
): boolean {
  for (
    let at = zoneId;
    at !== undefined;
    at = d.zones.find((z) => z.id === at)?.parentId
  )
    if (at === ancestor) return true;
  return false;
}

/** A parent change moves the item to a free spot in its new zone, so it is inside it. */
function reparent<T extends Zone | Box>(
  d: Diagram,
  item: T,
  patch: Partial<T>,
): T {
  const next = { ...item, ...patch };
  if (!("parentId" in patch) || patch.parentId === item.parentId) return next;
  const { w, h } = areaOf(item);
  const moved: Record<string, unknown> = {
    ...next,
    ...freeSpot(d, patch.parentId, { w, h }, "width" in item),
  };
  if (patch.parentId === undefined) delete moved.parentId;
  return moved as T;
}

export function updateZone(
  d: Diagram,
  id: string,
  patch: Partial<Pick<Zone, "label" | "kind" | "parentId">>,
): Diagram {
  // A zone can never sit inside itself, directly or through its own zones.
  if (patch.parentId !== undefined && within(d, patch.parentId, id)) return d;
  return {
    ...d,
    zones: d.zones.map((zone) =>
      zone.id === id
        ? withText(
            reparent<Zone>(d, zone, patch),
            "kind",
            "kind" in patch ? patch.kind : zone.kind,
          )
        : zone,
    ),
  };
}

/**
 * A TRM link belongs to business applications and (monitoring diagram) other systems, and on the infrastructure diagram
 * to servers: changing the type, or unlinking, drops it.
 */
export function updateBox(
  d: Diagram,
  id: string,
  patch: Partial<
    Pick<Box, "label" | "type" | "parentId" | "application" | "server" | "icon">
  >,
): Diagram {
  const changed = (box: Box): Box => {
    const next = reparent<Box>(d, box, patch);
    if (
      !next.application ||
      (next.type !== "business" && next.type !== "system")
    )
      delete next.application;
    if (!next.server || next.type !== "server") delete next.server;
    if (!next.icon) delete next.icon;
    return next;
  };
  return {
    ...d,
    boxes: d.boxes.map((box) => (box.id === id ? changed(box) : box)),
  };
}

/** Adds an integration connection (infrastructure diagram, section 2) with the facts given so far. */
export function addConnection(
  d: Diagram,
  {
    from,
    to,
    twoWay,
    protocol,
    port,
  }: {
    from: string;
    to: string;
    twoWay?: boolean;
    protocol?: string;
    port?: number;
  },
): Diagram {
  const line: Line = {
    id: nextId("line", allIds(d)),
    from,
    to,
    layer: "integration",
    ...(port !== undefined ? { port } : {}),
    ...(twoWay ? { twoWay } : {}),
  };
  return {
    ...d,
    lines: [...d.lines, withText(line, "protocol", protocol?.trim())],
  };
}

export function updateLine(
  d: Diagram,
  id: string,
  patch: Partial<Omit<Line, "id" | "fromSide" | "toSide">>,
): Diagram {
  const changed = (line: Line): Line => {
    let next: Line = { ...line, ...patch };
    for (const key of LINE_TEXT) next = withText(next, key, next[key]);
    // Plain styles and cleared choices are left out rather than stored as false or empty.
    if (!next.dashed) delete next.dashed;
    if (!next.twoWay) delete next.twoWay;
    for (const key of LINE_CHOICES)
      if (next[key] === undefined) delete next[key];
    // An API link belongs to the API pattern; what protects a connection, to one without TLS.
    if (next.pattern !== "api") delete next.api;
    if (next.tls !== "none") delete next.protection;
    return next;
  };
  return {
    ...d,
    lines: d.lines.map((line) => (line.id === id ? changed(line) : line)),
  };
}

export type MissingFact =
  | "calls"
  | "does"
  | "classification"
  | "frequency"
  | "protocol"
  | "port"
  | "tls"
  | "protection"
  | "pattern"
  | "api"
  | "authentication"
  | "purpose"
  | "flow";

/** The facts a connection still needs before submit, in one view (as the API counts them). */
export function missingFacts(view: DiagramView, line: Line): MissingFact[] {
  const blank = (value: string | undefined) => !value?.trim();
  if (view === "solution")
    return (["calls", "does"] as const).filter((key) => blank(line[key]));
  if (view === "data-flow" && !blank(line.data))
    return (["classification", "frequency"] as const).filter((key) =>
      blank(line[key]),
    );
  if (view !== "integration" || line.layer !== "integration") return [];
  const needed: [MissingFact, boolean][] = [
    ["protocol", blank(line.protocol)],
    ["port", line.port === undefined],
    ["tls", !line.tls],
    ["protection", line.tls === "none" && blank(line.protection)],
    ["pattern", !line.pattern],
    ["api", line.pattern === "api" && !line.api],
    ["authentication", blank(line.authentication)],
    ["classification", !line.classification],
    ["purpose", blank(line.purpose)],
    ["flow", !line.flow],
  ];
  return needed.filter(([, missing]) => missing).map(([fact]) => fact);
}

/** TLS 1.1 and 1.0 are allowed but flagged as not compliant. */
export const nonCompliantTls = (line: Line) =>
  line.layer === "integration" && (line.tls === "1.1" || line.tls === "1.0");

/** Whether removing a box or zone also removes integration connections (written in section 2). */
export function integrationLost(d: Diagram, id: string): boolean {
  return d.lines.some(
    (line) =>
      line.layer === "integration" && (line.from === id || line.to === id),
  );
}

const hasDataFacts = (line: Line) =>
  [line.data, line.classification, line.frequency].some((value) =>
    value?.trim(),
  );
/**
 * The views whose lines or facts, hidden from the editor, go if a zone, box or line is removed: those the item carries,
 * and those of the lines removed with it (`carriers` come from the API).
 */
export function hiddenLost(
  d: Diagram,
  id: string,
  carriers: readonly { id: string; view: DiagramView }[],
): DiagramView[] {
  const going = new Set([
    id,
    ...d.lines
      .filter((line) => line.from === id || line.to === id)
      .map((line) => line.id),
  ]);
  return [
    ...new Set(
      carriers
        .filter((carrier) => going.has(carrier.id))
        .map((carrier) => carrier.view),
    ),
  ];
}

/** Whether removing a zone, box or line also removes connections that hold data flow facts (written in section 9). */
export function dataFactsLost(d: Diagram, id: string): boolean {
  return d.lines.some(
    (line) =>
      (line.id === id || line.from === id || line.to === id) &&
      hasDataFacts(line),
  );
}

export function moveItem(
  d: Diagram,
  id: string,
  x: number,
  y: number,
): Diagram {
  if (d.zones.some((zone) => zone.id === id))
    return {
      ...d,
      zones: d.zones.map((zone) => (zone.id === id ? { ...zone, x, y } : zone)),
    };
  if (d.boxes.some((box) => box.id === id))
    return {
      ...d,
      boxes: d.boxes.map((box) => (box.id === id ? { ...box, x, y } : box)),
    };
  return d;
}

export function resizeZone(
  d: Diagram,
  id: string,
  width: number,
  height: number,
): Diagram {
  const size = (value: number) =>
    Math.min(50_000, Math.max(20, Math.round(value)));
  return {
    ...d,
    zones: d.zones.map((zone) =>
      zone.id === id
        ? { ...zone, width: size(width), height: size(height) }
        : zone,
    ),
  };
}

/**
 * Removes a zone, box or line. What sat in a removed zone moves up to that zone's parent, keeping its place
 * on the canvas; lines to anything removed go too.
 */
export function removeItem(d: Diagram, id: string): Diagram {
  const zone = d.zones.find((z) => z.id === id);
  const lines = d.lines.filter(
    (line) => line.id !== id && line.from !== id && line.to !== id,
  );
  if (!zone)
    return { ...d, boxes: d.boxes.filter((box) => box.id !== id), lines };
  const lift = <T extends Zone | Box>(item: T): T => {
    if (item.parentId !== id) return item;
    const lifted: Record<string, unknown> = {
      ...item,
      x: item.x + zone.x,
      y: item.y + zone.y,
      parentId: zone.parentId,
    };
    if (zone.parentId === undefined) delete lifted.parentId;
    return lifted as T;
  };
  return {
    ...d,
    zones: d.zones.filter((z) => z.id !== id).map((z) => lift(z)),
    boxes: d.boxes.map((b) => lift(b)),
    lines,
  };
}

/**
 * Fits zones to what they hold, deepest first, and moves neighbours apart. Sized automatically, a zone fits its contents
 * exactly (an empty one shrinks to its name); sized by hand, it keeps the author's size but grows to hold its contents
 * and never shrinks. A zone that grows pushes the zones and boxes level with it to the right and those below it down
 * (a row moves down together), keeping them 30px apart; `push: false` (while an item is dragged) leaves that to the drop.
 */
export function autoFit(
  d: Diagram,
  { push = true }: { push?: boolean } = {},
): Diagram {
  const auto = d.sizing === "auto";
  const zones = new Map(d.zones.map((zone) => [zone.id, { ...zone }]));
  const boxes = new Map(d.boxes.map((box) => [box.id, { ...box }]));
  const childrenOf = (parentId: string | undefined): (Zone | Box)[] =>
    [...zones.values(), ...boxes.values()].filter(
      (item) => item.parentId === parentId,
    );
  const isZone = (item: Zone | Box) => "width" in item;

  const pushApart = (siblings: (Zone | Box)[]) => {
    const placed: { area: Area; zone: boolean }[] = [];
    for (const item of [...siblings].sort(
      (a, b) => a.y - b.y || Number(isZone(b)) - Number(isZone(a)) || a.x - b.x,
    )) {
      const area = areaOf(item);
      for (let tries = 0; tries < 50; tries++) {
        const hit = placed.find((other) => !apart(area, other.area));
        if (!hit) break;
        // Lower than what it meets goes below it (a row stays a row), as does a box level with a zone (zones come first).
        if (
          area.y > hit.area.y ||
          (hit.zone && !isZone(item) && area.y === hit.area.y)
        )
          area.y = hit.area.y + hit.area.h + GAP;
        else area.x = hit.area.x + hit.area.w + GAP;
      }
      placed.push({ area, zone: isZone(item) });
      Object.assign(item, { x: area.x, y: area.y });
    }
  };

  const fit = (zone: Zone): void => {
    const kids = childrenOf(zone.id);
    for (const kid of kids) if ("width" in kid) fit(kid);
    if (push) pushApart(kids);
    if (kids.length === 0) {
      if (auto)
        Object.assign(zone, {
          width: emptyZoneWidth(zone.label, zone.kind),
          height: EMPTY_ZONE_HEIGHT,
        });
      return;
    }
    const width = Math.round(
      Math.max(...kids.map((kid) => kid.x + areaOf(kid).w)) + PAD,
    );
    const height = Math.round(
      Math.max(...kids.map((kid) => kid.y + areaOf(kid).h)) + PAD,
    );
    Object.assign(
      zone,
      auto
        ? { width, height }
        : {
            width: Math.max(zone.width, width),
            height: Math.max(zone.height, height),
          },
    );
  };

  for (const item of childrenOf(undefined)) if ("width" in item) fit(item);
  if (push) pushApart(childrenOf(undefined));
  return {
    ...d,
    zones: d.zones.map((zone) => zones.get(zone.id)!),
    boxes: d.boxes.map((box) => boxes.get(box.id)!),
  };
}

/** A dropped zone or box that lands on or too close to a neighbour moves to the nearest spot 30px clear of them all. */
export function snapToFree(d: Diagram, id: string): Diagram {
  const item: Zone | Box =
    d.zones.find((zone) => zone.id === id) ??
    d.boxes.find((box) => box.id === id)!;
  const me = areaOf(item);
  const others = [...d.zones, ...d.boxes]
    .filter((other) => other.id !== id && other.parentId === item.parentId)
    .map(areaOf);
  if (others.every((other) => apart(me, other))) return d;
  const min =
    item.parentId === undefined ? { x: -Infinity, y: -Infinity } : INSIDE_MIN;
  const xs = [
    me.x,
    ...others.flatMap((other) => [
      other.x + other.w + GAP,
      other.x - me.w - GAP,
    ]),
  ].filter((x) => x >= min.x);
  const ys = [
    me.y,
    ...others.flatMap((other) => [
      other.y + other.h + GAP,
      other.y - me.h - GAP,
    ]),
  ].filter((y) => y >= min.y);
  const distance = (spot: Area) => Math.hypot(spot.x - me.x, spot.y - me.y);
  const free = xs
    .flatMap((x) => ys.map((y) => ({ ...me, x, y })))
    .filter((spot) => others.every((other) => apart(spot, other)));
  // Straight below everything is always free.
  const nearest = free.reduce((best, spot) =>
    distance(spot) < distance(best) ? spot : best,
  );
  return moveItem(d, id, nearest.x, nearest.y);
}

/** Adds a titled diagram; its id is new, and none of `reserved` (diagrams removed whose files go only when the slot is saved). */
export function addDiagram(
  content: Content,
  title: string,
  reserved: readonly string[] = [],
): Content {
  const id = nextId("diagram", [
    ...content.diagrams.map((d) => d.id),
    ...reserved,
  ]);
  return {
    ...content,
    diagrams: [...content.diagrams, emptyDiagram(id, title.trim())],
  };
}

export function updateDiagram(
  content: Content,
  id: string,
  patch: Partial<Pick<Diagram, "title" | "sizing">>,
): Content {
  return {
    ...content,
    diagrams: content.diagrams.map((d) =>
      d.id === id ? { ...d, ...patch } : d,
    ),
  };
}

/** A slot always keeps at least one diagram. */
export function removeDiagram(content: Content, id: string): Content {
  if (content.diagrams.length <= 1) return content;
  return { ...content, diagrams: content.diagrams.filter((d) => d.id !== id) };
}

/** Answered for submit: Not applicable with a reason, or every diagram has at least one box. */
export function answered(content: DiagramContent): boolean {
  if ("notApplicable" in content) return content.reason.trim() !== "";
  return (
    content.diagrams.length > 0 &&
    content.diagrams.every((d) => d.boxes.length > 0)
  );
}
