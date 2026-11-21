import {
  getSmoothStepPath,
  MarkerType,
  Position,
  type CoordinateExtent,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type { Diagram, Line, Side, Zone } from "../schemas";
import type { ChangeKind } from "./compare";
import { BOX_HEIGHT, BOX_WIDTH, INSIDE_MIN } from "./model";
import { isStep } from "./shapes";

export interface ZoneNodeData extends Record<string, unknown> {
  label: string;
  kind?: string;
  /** Nothing inside it */
  empty: boolean;
  /** Sized by hand and editable: its corners can be dragged when selected */
  resizable: boolean;
  /** How it changed between two compared versions */
  change?: ChangeKind;
}
export interface BoxNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  /** Picked from TRM: its APM number (null when TRM has none) */
  trm?: string | null;
  /** A server picked from TRM */
  server?: true;
  /** An Azure icon */
  icon?: string;
  /** A CI or CD approval step: who approves */
  approver?: string;
  /** How it changed between two compared versions */
  change?: ChangeKind;
}
export interface LineEdgeData extends Record<string, unknown> {
  label?: string;
  dashed?: boolean;
  /** Still missing facts needed before submit (shown with a warning) */
  missing?: boolean;
  /** On TLS 1.1 or 1.0 (shown with a warning) */
  nonCompliant?: boolean;
  /** One of several lines between the same sides of the same two things */
  spread?: Spread;
  /** How it changed between two compared versions */
  change?: ChangeKind;
}
/** Where a line runs among others between the same sides: moved across the sides by `offset`, bending at `at` (0 to 1) of the way from its start. */
export interface Spread {
  offset: number;
  at: number;
}
/** The most room between lines that share sides, and what they leave clear at each end of a side. */
const SPREAD = 32;
const SIDE_MARGIN = 8;
/** What a line shows in a view: the solution view what it calls, the data flow view its data, the integration view protocol, port and TLS. */
export type LineLabel = (line: Line) => {
  label?: string;
  missing: boolean;
  nonCompliant?: boolean;
};
const plainLabel: LineLabel = (line) => ({ label: line.label, missing: false });

/** A box or zone may be dragged (or a zone resized) past its zone's right or bottom edge: the zone grows to follow. */
const GROWTH: CoordinateExtent = [
  [INSIDE_MIN.x, INSIDE_MIN.y],
  [1e6, 1e6],
];

function absolute(
  d: Diagram,
  id: string,
): { x: number; y: number; w: number; h: number } {
  const zone = d.zones.find((z) => z.id === id);
  // Lines only join things on the diagram: the API refuses others, and removing something removes its lines.
  const item: Zone | Diagram["boxes"][number] =
    zone ?? d.boxes.find((b) => b.id === id)!;
  const parent = item.parentId ? absolute(d, item.parentId) : { x: 0, y: 0 };
  return {
    x: parent.x + item.x,
    y: parent.y + item.y,
    w: zone ? zone.width : BOX_WIDTH,
    h: zone ? zone.height : BOX_HEIGHT,
  };
}

/** The sides a line leaves and enters: the author's choice, else facing each other along the longer distance. */
export function autoSides(d: Diagram, line: Line): [Side, Side] {
  if (line.fromSide && line.toSide) return [line.fromSide, line.toSide];
  const a = absolute(d, line.from);
  const b = absolute(d, line.to);
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ["r", "l"] : ["l", "r"];
  return dy > 0 ? ["b", "t"] : ["t", "b"];
}

/**
 * Lines between the same sides of the same two things, spread so none is drawn over another: evenly across the shorter
 * of the two sides, and bending at a different place along the way (measured from each line's own start).
 */
function spreads(d: Diagram, sides: [Side, Side][]): (Spread | undefined)[] {
  const end = (id: string, side: Side) => `${id}:${side}`;
  const key = (line: Line, [from, to]: [Side, Side]) =>
    [end(line.from, from), end(line.to, to)].sort().join(" ");
  const groups = new Map<string, number[]>();
  d.lines.forEach((line, index) =>
    groups.set(key(line, sides[index]), [
      ...(groups.get(key(line, sides[index])) ?? []),
      index,
    ]),
  );
  const sideLength = (id: string, side: Side) =>
    side === "l" || side === "r" ? absolute(d, id).h : absolute(d, id).w;
  return d.lines.map((line, index) => {
    const group = groups.get(key(line, sides[index]))!;
    if (group.length === 1) return undefined;
    const [from, to] = sides[index];
    const room =
      Math.min(sideLength(line.from, from), sideLength(line.to, to)) -
      2 * SIDE_MARGIN;
    const step = Math.min(SPREAD, room / (group.length - 1));
    const place = group.indexOf(index);
    const along = (place + 0.5) / group.length;
    const forward = end(line.from, from) < end(line.to, to);
    return {
      offset: (place - (group.length - 1) / 2) * step,
      at: forward ? along : 1 - along,
    };
  });
}

/** A line's path and label position: React Flow's smooth step, moved as its spread says. */
export function linePath(
  ends: {
    sourceX: number;
    sourceY: number;
    sourcePosition: Position;
    targetX: number;
    targetY: number;
    targetPosition: Position;
  },
  spread?: Spread,
): [path: string, labelX: number, labelY: number] {
  const across = (position: Position) =>
    position === Position.Left || position === Position.Right;
  const move = (x: number, y: number, position: Position) =>
    across(position)
      ? { x, y: y + spread!.offset }
      : { x: x + spread!.offset, y };
  const source = spread
    ? move(ends.sourceX, ends.sourceY, ends.sourcePosition)
    : { x: ends.sourceX, y: ends.sourceY };
  const target = spread
    ? move(ends.targetX, ends.targetY, ends.targetPosition)
    : { x: ends.targetX, y: ends.targetY };
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: ends.sourcePosition,
    targetX: target.x,
    targetY: target.y,
    targetPosition: ends.targetPosition,
    borderRadius: 10,
    ...(spread ? { stepPosition: spread.at } : {}),
  });
  return [path, labelX, labelY];
}

/**
 * A diagram as React Flow nodes (parents before children) and edges. Nodes carry their known size as `measured`: they are
 * rebuilt on every edit, and without it React Flow would treat them all as new and unmeasured (and fit the view without them).
 */
export function toFlow(
  d: Diagram,
  {
    selected,
    editable,
    lineLabel = plainLabel,
    marks,
  }: {
    selected: string | null;
    editable: boolean;
    lineLabel?: LineLabel;
    marks?: ReadonlyMap<string, ChangeKind>;
  },
): { nodes: Node[]; edges: Edge[] } {
  const depth = (zone: Zone): number =>
    zone.parentId ? 1 + depth(d.zones.find((z) => z.id === zone.parentId)!) : 0;
  const holders = new Set(
    [...d.zones, ...d.boxes].map((item) => item.parentId),
  );
  const inside = (parentId: string | undefined) =>
    parentId ? { parentId, extent: GROWTH } : {};
  const zones: Node<ZoneNodeData>[] = [...d.zones]
    .sort((a, b) => depth(a) - depth(b))
    .map((zone) => ({
      id: zone.id,
      type: "zone",
      position: { x: zone.x, y: zone.y },
      width: zone.width,
      height: zone.height,
      measured: { width: zone.width, height: zone.height },
      style: { width: zone.width, height: zone.height },
      ...inside(zone.parentId),
      selected: selected === zone.id,
      data: {
        label: zone.label,
        kind: zone.kind,
        empty: !holders.has(zone.id),
        resizable: editable && d.sizing === "manual",
        change: marks?.get(zone.id),
      },
    }));
  const boxes: Node<BoxNodeData>[] = d.boxes.map((box) => ({
    id: box.id,
    // CI and CD steps are drawn by kind (rounded, diamond, approval); other boxes with their icon or shape.
    type: isStep(box.type) ? "step" : "box",
    position: { x: box.x, y: box.y },
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    measured: { width: BOX_WIDTH, height: BOX_HEIGHT },
    ...inside(box.parentId),
    selected: selected === box.id,
    data: {
      label: box.label,
      type: box.type,
      ...(box.application ? { trm: box.application.number } : {}),
      ...(box.server ? { server: true as const } : {}),
      ...(box.icon ? { icon: box.icon } : {}),
      ...(box.approver ? { approver: box.approver } : {}),
      change: marks?.get(box.id),
    },
  }));
  const sides = d.lines.map((line) => autoSides(d, line));
  const spread = spreads(d, sides);
  const edges: Edge<LineEdgeData>[] = d.lines.map((line, index) => {
    const [sourceHandle, targetHandle] = sides[index];
    const marker = {
      type: MarkerType.ArrowClosed,
      color: "var(--color-icon-default)",
    };
    return {
      id: line.id,
      type: "line",
      source: line.from,
      target: line.to,
      sourceHandle,
      targetHandle,
      markerEnd: marker,
      ...(line.twoWay ? { markerStart: marker } : {}),
      selected: selected === line.id,
      data: {
        ...lineLabel(line),
        dashed: line.dashed,
        ...(spread[index] ? { spread: spread[index] } : {}),
        change: marks?.get(line.id),
      },
    };
  });
  return { nodes: [...zones, ...boxes], edges };
}

/** A move says whether a drag is still going on (React Flow sends false when it drops; a corner resize sends neither). */
export type CanvasEdit =
  | { kind: "move"; id: string; x: number; y: number; dragging?: boolean }
  | { kind: "resize"; id: string; width: number; height: number }
  | { kind: "select"; id: string };

/** What a canvas change means for the diagram: a drag, a resize by hand, or a selection. */
export function editFrom(change: NodeChange): CanvasEdit | null {
  if (change.type === "position" && change.position) {
    const move = {
      kind: "move" as const,
      id: change.id,
      x: Math.round(change.position.x),
      y: Math.round(change.position.y),
    };
    return change.dragging === undefined
      ? move
      : { ...move, dragging: change.dragging };
  }
  if (change.type === "dimensions" && change.resizing && change.dimensions)
    return {
      kind: "resize",
      id: change.id,
      width: change.dimensions.width,
      height: change.dimensions.height,
    };
  if (change.type === "select" && change.selected)
    return { kind: "select", id: change.id };
  return null;
}
