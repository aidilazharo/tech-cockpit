import {
  BLOCK_TYPES,
  type Box,
  type Diagram,
  type DiagramSlot,
  type InfraZoneKind,
  type Line,
  type Zone,
} from "../../schemas";
import { azureIconName } from "../icons";
import { boxPlaces, zonePlaces } from "../infrastructure";
import { autoFit, BOX_HEIGHT, BOX_WIDTH } from "../model";
import { builtInService } from "../monitoring";
import { laneSpot, layoutLanes } from "../process";
import { MONITORING_BLOCKS, PROCESS_STEPS, TITLED } from "../shapes";
import type { DrawioItem, DrawioPage, DrawioShape } from "./read";

export const SKIP = "skip";
/** Merging an infrastructure container into one of the zones always on the diagram: "into:<that zone's id>". */
export const INTO = "into:";
const FIXED_ZONES = [
  "subscription",
  "primary-region",
  "dr-region",
  "primary-dc",
  "dr-dc",
  "office",
] as const;
const ADDED_ZONES: InfraZoneKind[] = [
  "vnet",
  "subnet",
  "internet",
  "azure-global",
  "third-party",
];
const ONE_EACH: string[] = ["internet", "azure-global", "third-party"];
/** What a container can become on each diagram. */
const CONTAINER_KINDS: Record<DiagramSlot, readonly string[]> = {
  solution: ["group"],
  infrastructure: [...ADDED_ZONES, ...FIXED_ZONES.map((id) => `${INTO}${id}`)],
  "ci-cd": ["lane"],
  monitoring: ["group"],
};
/** What a shape can become on each diagram (the infrastructure's Azure service only with an Azure icon). */
const SHAPE_KINDS: Record<DiagramSlot, readonly string[]> = {
  solution: BLOCK_TYPES,
  infrastructure: [
    "server",
    "person",
    "firewall",
    "wifi",
    "vpn",
    "azure",
    "external",
    "business",
  ],
  "ci-cd": PROCESS_STEPS,
  monitoring: MONITORING_BLOCKS,
};
/** Blocks that may link to a TRM application: business applications (solution) and other systems (monitoring). */
export const LINKABLE: readonly string[] = ["business", "system"];

/** One container or shape in the review: what draw.io says it is, and what it becomes (null: still to choose). */
export interface ReviewRow {
  id: string;
  label: string;
  container: boolean;
  shape: DrawioShape;
  icon?: string;
  becomes: string | null;
  /** CI and CD flows: the lane picked for a step drawn outside the swimlanes (a container's id, or "new-<n>" for a lane named in the review) */
  lane?: string;
}
export interface NotImported {
  label: string;
  reason:
    | "text"
    | "loose-arrow"
    | "no-text"
    | "no-text-box"
    | "skipped"
    | "end-not-imported"
    | "lane-arrow";
  /** An arrow's ends, by name */
  from?: string;
  to?: string;
}
export interface Review {
  rows: ReviewRow[];
  notImported: NotImported[];
}
/** Still to choose; a step's lane; an infrastructure zone or box where it may not sit; a second Internet, Azure global services or 3rd party zone. */
export type RowProblem = "choose" | "lane" | "place" | "one-each";
/** A TRM application a block is linked to, as TRM names it. */
export type TrmLink = { id: string; number: string | null; name: string };

/** The kinds a container or shape can become on a diagram (Skip aside). */
export function kindsFor(
  slot: DiagramSlot,
  { container, icon }: { container: boolean; icon?: string },
): readonly string[] {
  if (container) return CONTAINER_KINDS[slot];
  return slot === "infrastructure" && !icon
    ? SHAPE_KINDS[slot].filter((kind) => kind !== "azure")
    : SHAPE_KINDS[slot];
}

/** A guess only where the shape says what it is; null otherwise (the author chooses). */
function guess(
  slot: DiagramSlot,
  item: DrawioItem,
  label: string,
  page: DrawioPage,
): string | null {
  // An infrastructure container's zone cannot be told from its shape.
  if (item.container)
    return slot === "infrastructure" ? null : CONTAINER_KINDS[slot][0];
  if (slot === "solution")
    return item.shape === "person" ? "actor" : item.icon ? "part" : null;
  if (slot === "monitoring")
    return item.shape === "person"
      ? "team"
      : item.icon || builtInService(label)
        ? "monitoring"
        : null;
  if (slot === "infrastructure")
    return item.shape === "person" ? "person" : item.icon ? "azure" : null;
  if (item.shape === "rhombus") return "decision";
  if (item.shape === "rectangle") return "step";
  if (item.shape !== "terminator") return null;
  // A rounded or oval flow shape starts the flow when nothing leads to it, and ends it when nothing leads from it.
  if (!page.arrows.some((arrow) => arrow.to === item.id)) return "start";
  return page.arrows.some((arrow) => arrow.from === item.id) ? "step" : "end";
}

/**
 * The review of a page: a row per container and shape with a guess at what it becomes. An unnamed Azure icon is named
 * by its product; other shapes without text are not imported, and a box without text gives what it holds to its own box.
 */
export function reviewOf(slot: DiagramSlot, page: DrawioPage): Review {
  const notImported: NotImported[] = [...page.skipped];
  const rows: ReviewRow[] = [];
  for (const item of page.items) {
    const label = item.label || (item.icon ? azureIconName(item.icon) : "");
    if (!label) {
      notImported.push({
        label: "",
        reason: item.container ? "no-text-box" : "no-text",
      });
      continue;
    }
    rows.push({
      id: item.id,
      label,
      container: item.container,
      shape: item.shape,
      ...(item.icon ? { icon: item.icon } : {}),
      becomes: guess(slot, item, label, page),
    });
  }
  return { rows, notImported };
}

/** How the page's items sit: what each is kept as, and where each is on the page. */
function layout(page: DrawioPage, rows: ReviewRow[]) {
  const items = new Map(page.items.map((item) => [item.id, item]));
  const rowOf = new Map(rows.map((row) => [row.id, row]));
  const kept = (id: string) => {
    const becomes = rowOf.get(id)?.becomes;
    return becomes !== undefined && becomes !== null && becomes !== SKIP;
  };
  /** The nearest container around an item that is imported (others give what they hold to their own container). */
  const holder = (item: DrawioItem): DrawioItem | undefined => {
    for (let at = item.parentId; at !== undefined; at = items.get(at)?.parentId)
      if (kept(at) && rowOf.get(at)!.container) return items.get(at);
    return undefined;
  };
  const absolute = (item: DrawioItem): { x: number; y: number } => {
    const parent =
      item.parentId === undefined ? undefined : items.get(item.parentId);
    const at = parent ? absolute(parent) : { x: 0, y: 0 };
    return { x: at.x + item.x, y: at.y + item.y };
  };
  return { items, kept, holder, absolute };
}

/** CI and CD steps drawn outside every imported swimlane: each needs its lane picked in the review. */
export function stepsWithoutLane(
  slot: DiagramSlot,
  page: DrawioPage,
  rows: ReviewRow[],
): Set<string> {
  if (slot !== "ci-cd") return new Set();
  const { items, holder } = layout(page, rows);
  return new Set(
    rows
      .filter(
        (row) =>
          !row.container &&
          row.becomes !== null &&
          row.becomes !== SKIP &&
          !holder(items.get(row.id)!),
      )
      .map((row) => row.id),
  );
}

/** Boxes keep their size, so draw.io shapes smaller than ours are spaced out in proportion (up to three times). */
function scaleOf(
  page: DrawioPage,
  rows: ReviewRow[],
  kept: (id: string) => boolean,
): number {
  const widths = rows
    .filter((row) => !row.container && kept(row.id))
    .map((row) => page.items.find((item) => item.id === row.id)!.width)
    .filter((width) => width > 0)
    .sort((a, b) => a - b);
  const median =
    widths.length > 0 ? widths[Math.floor(widths.length / 2)] : BOX_WIDTH;
  return Math.min(3, Math.max(1, BOX_WIDTH / median));
}

/** New ids go on after the highest "<prefix>-<n>" on the diagram replaced, so nothing kept for its items attaches to new ones. */
function numbering(base: Diagram) {
  const highest = (prefix: string) =>
    Math.max(
      0,
      ...[...base.zones, ...base.boxes, ...base.lines]
        .map((item) => item.id)
        .concat(base.taken ?? [])
        .map((id) => new RegExp(`^${prefix}-(\\d+)$`).exec(id)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(Number),
    );
  const next = {
    zone: highest("zone"),
    box: highest("box"),
    line: highest("line"),
  };
  return (prefix: keyof typeof next) => `${prefix}-${++next[prefix]}`;
}

/** Inside a zone, clear of its name and edge. */
const INSIDE = { x: 15, y: 35 };

/** Builds the diagram, and which id each row and arrow end got. */
function build(
  slot: DiagramSlot,
  page: DrawioPage,
  rows: ReviewRow[],
  {
    base,
    links,
    lanes = [],
  }: { base: Diagram; links: Record<string, TrmLink>; lanes?: string[] },
) {
  const { items, kept, holder, absolute } = layout(page, rows);
  const scale = scaleOf(page, rows, kept);
  const next = numbering(base);
  const notImported: NotImported[] = [
    ...reviewOf(slot, page).notImported,
    ...rows
      .filter((row) => row.becomes === SKIP)
      .map((row) => ({ label: row.label, reason: "skipped" as const })),
  ];
  const flow = slot === "ci-cd";
  const relative = (item: DrawioItem, parent: DrawioItem | undefined) => {
    const at = absolute(item);
    const from = parent ? absolute(parent) : { x: 0, y: 0 };
    return { x: (at.x - from.x) * scale, y: (at.y - from.y) * scale };
  };
  const clamp = (x: number, y: number, inside: boolean) => ({
    x: Math.round(inside ? Math.max(INSIDE.x, x) : x),
    y: Math.round(inside ? Math.max(INSIDE.y, y) : y),
  });

  // Zones (lanes in a flow, top to bottom as drawn, then the lanes named in the review), then boxes, then lines.
  const containers = rows.filter((row) => row.container && kept(row.id));
  const ordered = flow
    ? [...containers].sort(
        (a, b) => absolute(items.get(a.id)!).y - absolute(items.get(b.id)!).y,
      )
    : containers;
  const ids = new Map<string, string>();
  // An infrastructure container merged into a fixed zone gives its contents to that zone.
  for (const row of ordered)
    ids.set(
      row.id,
      row.becomes!.startsWith(INTO)
        ? row.becomes!.slice(INTO.length)
        : next("zone"),
    );
  lanes.forEach((_, index) => ids.set(`new-${index + 1}`, next("zone")));
  const zones: Zone[] = ordered
    .filter((row) => !row.becomes!.startsWith(INTO))
    .map((row) => {
      const item = items.get(row.id)!;
      // Lanes never sit inside one another.
      const parent = flow ? undefined : holder(item);
      const at = relative(item, parent);
      const kind = flow
        ? "lane"
        : slot === "infrastructure"
          ? row.becomes!
          : undefined;
      return {
        id: ids.get(row.id)!,
        label: row.label,
        ...(kind ? { kind } : {}),
        ...(parent ? { parentId: ids.get(parent.id)! } : {}),
        ...clamp(at.x, at.y, parent !== undefined),
        width: Math.max(120, Math.round(item.width * scale)),
        height: Math.max(40, Math.round(item.height * scale)),
      };
    });
  const named: Zone[] = lanes.map((label, index) => ({
    id: ids.get(`new-${index + 1}`)!,
    label: label.trim(),
    kind: "lane",
    x: 0,
    y: 0,
    width: 640,
    height: 140,
  }));
  // The infrastructure diagram keeps the zones always on it (named by its hosting settings).
  const fixed =
    slot === "infrastructure" ? base.zones.filter((zone) => zone.hosting) : [];
  let diagram: Diagram = {
    ...base,
    title: TITLED[slot] ? page.name : base.title,
    sizing: "auto",
    zones: [...fixed, ...zones, ...named],
    boxes: [],
    lines: [],
  };

  for (const row of rows.filter((item) => !item.container && kept(item.id))) {
    const item = items.get(row.id)!;
    const parent = holder(item);
    const lane = flow && !parent ? ids.get(row.lane!) : undefined;
    const parentId = parent ? ids.get(parent.id)! : lane;
    const at = relative(item, parent);
    // A step put into a lane it was not drawn in goes after that lane's steps.
    const spot = lane
      ? laneSpot(diagram, lane)
      : clamp(
          at.x + (item.width * scale) / 2 - BOX_WIDTH / 2,
          at.y + (item.height * scale) / 2 - BOX_HEIGHT / 2,
          parent !== undefined,
        );
    const icon =
      item.icon ??
      (row.becomes === "monitoring"
        ? builtInService(row.label)?.icon
        : undefined);
    const link = LINKABLE.includes(row.becomes!) ? links[row.id] : undefined;
    const box: Box = {
      id: next("box"),
      label: link ? link.name : row.label,
      type: row.becomes!,
      ...(icon ? { icon } : {}),
      ...(link ? { application: { id: link.id, number: link.number } } : {}),
      ...(parentId ? { parentId } : {}),
      ...spot,
    };
    ids.set(row.id, box.id);
    diagram = { ...diagram, boxes: [...diagram.boxes, box] };
  }

  const nameOf = (id: string) =>
    rows.find((row) => row.id === id)?.label ?? items.get(id)?.label ?? "";
  const zoneIds = new Set(diagram.zones.map((zone) => zone.id));
  const lines: Line[] = [];
  for (const arrow of page.arrows) {
    const from = ids.get(arrow.from);
    const to = ids.get(arrow.to);
    const ends = {
      label: arrow.label,
      from: nameOf(arrow.from),
      to: nameOf(arrow.to),
    };
    if (!from || !to) notImported.push({ ...ends, reason: "end-not-imported" });
    else if (flow && (zoneIds.has(from) || zoneIds.has(to)))
      notImported.push({ ...ends, reason: "lane-arrow" });
    else {
      const text = arrow.label.slice(0, 500);
      lines.push({
        id: next("line"),
        from,
        to,
        // The solution diagram's connections say what they call instead of having a label.
        ...(text
          ? slot === "solution"
            ? { calls: text }
            : { label: text }
          : {}),
        ...(arrow.dashed ? { dashed: true } : {}),
        ...(arrow.twoWay ? { twoWay: true } : {}),
      });
    }
  }
  diagram = { ...diagram, lines };
  // Imported shapes keep their drawn places; neighbours are moved apart only once the diagram is edited.
  return {
    diagram: flow ? layoutLanes(diagram) : autoFit(diagram, { push: false }),
    notImported,
    ids,
  };
}

/**
 * The diagram a reviewed page becomes, in place of `base` (keeping its id, and the infrastructure tab's fixed zones;
 * CI and CD flows and monitoring diagrams are named after the page). Shapes keep their places; zones and lanes fit what
 * they hold. Arrows join what is imported.
 */
export function importDiagram(
  slot: DiagramSlot,
  page: DrawioPage,
  rows: ReviewRow[],
  options: { base: Diagram; links: Record<string, TrmLink>; lanes?: string[] },
) {
  const { diagram, notImported } = build(slot, page, rows, options);
  return { diagram, notImported };
}

/**
 * What still stops the import: rows without a kind, CI and CD steps without a lane, and (infrastructure, `base` being
 * the tab imported into) zones and boxes where they may not sit, or a second Internet, Azure global services or 3rd party zone.
 */
export function reviewProblems(
  slot: DiagramSlot,
  page: DrawioPage,
  rows: ReviewRow[],
  lanes: string[],
  base?: Diagram,
): Record<string, RowProblem> {
  const { kept } = layout(page, rows);
  const problems: Record<string, RowProblem> = {};
  const laneIds = new Set([
    ...rows.filter((row) => row.container && kept(row.id)).map((row) => row.id),
    ...lanes.map((_, index) => `new-${index + 1}`),
  ]);
  const loose = stepsWithoutLane(slot, page, rows);
  for (const row of rows) {
    if (row.becomes === null) problems[row.id] = "choose";
    else if (loose.has(row.id) && !laneIds.has(row.lane ?? ""))
      problems[row.id] = "lane";
  }
  if (slot !== "infrastructure" || !base) return problems;
  const { diagram, ids } = build(slot, page, rows, { base, links: {} });
  const seen = new Set<string>();
  for (const row of rows.filter(
    (item) => kept(item.id) && !item.becomes!.startsWith(INTO),
  )) {
    const id = ids.get(row.id)!;
    if (row.container) {
      const zone = diagram.zones.find((item) => item.id === id)!;
      if (ONE_EACH.includes(row.becomes!) && seen.has(row.becomes!))
        problems[row.id] = "one-each";
      else if (
        !zonePlaces(diagram, row.becomes as InfraZoneKind).includes(
          zone.parentId ?? null,
        )
      )
        problems[row.id] = "place";
      seen.add(row.becomes!);
    } else if (
      !boxPlaces(diagram, row.becomes!).includes(
        diagram.boxes.find((box) => box.id === id)!.parentId ?? null,
      )
    )
      problems[row.id] = "place";
  }
  return problems;
}
