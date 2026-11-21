import type { Diagram, Line } from "../schemas";
import type { CanvasEdit } from "./flow";
import { moveItem, resizeZone, snapToFree } from "./model";

// Helpers the diagram panes share (components are in parts.tsx).

/** The Dropdown needs a value for "not inside a zone". */
export const TOP = "__top__";

/** A change to the diagram; `dragging` while an item is being dragged, so neighbours are only moved once it drops. */
export type Change = (
  fn: (d: Diagram) => Diagram,
  options?: { dragging: boolean },
) => void;
export type PaneMode = "draw" | "facts" | "read";

/** Names of the zones and boxes on a diagram, for tables, details and dropdowns. */
export function namesOf(diagram: Diagram) {
  const names = new Map(
    [...diagram.zones, ...diagram.boxes].map((item) => [item.id, item.label]),
  );
  // Every parent and line end is on the diagram (the model keeps it so).
  return (id: string | undefined) => (id === undefined ? "" : names.get(id)!);
}

/** Zones to put something inside, with "not inside" first. */
export function zoneOptions(
  diagram: Diagram,
  notInside: string,
  except?: string,
) {
  return [
    { value: TOP, label: notInside },
    ...diagram.zones
      .filter((zone) => zone.id !== except)
      .map((zone) => ({ value: zone.id, label: zone.label })),
  ];
}

/** Drags, resizes and selection from the canvas, applied together; a dropped item snaps clear of its neighbours. */
export function canvasEdits(
  diagram: Diagram,
  change: Change | undefined,
  select: (id: string) => void,
) {
  return (edits: CanvasEdit[]) => {
    let next = diagram;
    let dragging = false;
    for (const edit of edits) {
      if (edit.kind === "select") select(edit.id);
      else if (edit.kind === "move") {
        next = moveItem(next, edit.id, edit.x, edit.y);
        if (edit.dragging === false) next = snapToFree(next, edit.id);
        dragging ||= edit.dragging === true;
      } else next = resizeZone(next, edit.id, edit.width, edit.height);
    }
    if (change && next !== diagram) change(() => next, { dragging });
  };
}

/** A line's style in words: solid or dashed, one-way or two-way. */
export function lineStyle(t: (key: string) => string, line: Line): string {
  return `${line.dashed ? t("sad.diagram.dashedShort") : t("sad.diagram.solid")} · ${line.twoWay ? t("sad.diagram.twoWayShort") : t("sad.diagram.oneWay")}`;
}
