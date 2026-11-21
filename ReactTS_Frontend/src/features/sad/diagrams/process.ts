import type { Box, Diagram } from "../schemas";
import { addBox, addZone, BOX_HEIGHT, BOX_WIDTH, withText } from "./model";
import type { ProcessStep } from "./shapes";

const LANE_WIDTH = 640;
const LANE_HEIGHT = 140;
/** A step's place in its lane: under the lane's name, then left to right. */
const STEP_LEFT = 40;
const STEP_TOP = 40;
const STEP_GAP = 60;
const LANE_PAD = { right: 40, bottom: 20 };

/** Where a new step goes in a lane: to the right of its last step. */
export function laneSpot(d: Diagram, laneId: string): { x: number; y: number } {
  const steps = d.boxes.filter((box) => box.parentId === laneId);
  return {
    x:
      steps.length === 0
        ? STEP_LEFT
        : Math.max(...steps.map((step) => step.x)) + BOX_WIDTH + STEP_GAP,
    y: STEP_TOP,
  };
}

/**
 * Lanes stacked top to bottom in their order. Sized automatically, each is tall enough for its steps and all are as
 * wide as the widest; sized by hand, they keep the author's sizes, growing (never shrinking) to fit their steps.
 */
export function layoutLanes(d: Diagram): Diagram {
  const stepsIn = (laneId: string) =>
    d.boxes.filter((box) => box.parentId === laneId);
  const reach = (laneId: string, side: "x" | "y") =>
    Math.max(
      0,
      ...stepsIn(laneId).map(
        (step) => step[side] + (side === "x" ? BOX_WIDTH : BOX_HEIGHT),
      ),
    );
  const auto = d.sizing === "auto";
  const width = Math.max(
    LANE_WIDTH,
    ...d.zones.map((lane) => reach(lane.id, "x") + LANE_PAD.right),
  );
  let top = 0;
  const zones = d.zones.map((lane) => {
    const size = auto
      ? {
          width,
          height: Math.max(LANE_HEIGHT, reach(lane.id, "y") + LANE_PAD.bottom),
        }
      : {
          width: Math.max(lane.width, reach(lane.id, "x") + LANE_PAD.right),
          height: Math.max(lane.height, reach(lane.id, "y") + LANE_PAD.bottom),
        };
    const placed = { ...lane, x: 0, y: top, ...size };
    top += size.height;
    return placed;
  });
  return { ...d, zones };
}

export function addLane(d: Diagram, label: string): Diagram {
  return layoutLanes(addZone(d, { label, kind: "lane" }));
}

/** Moves a lane one place up (-1) or down (1); the top and bottom lanes stay put when asked to go further. */
export function moveLane(d: Diagram, id: string, by: -1 | 1): Diagram {
  const from = d.zones.findIndex((lane) => lane.id === id);
  const to = from + by;
  if (to < 0 || to >= d.zones.length) return d;
  const zones = [...d.zones];
  [zones[from], zones[to]] = [zones[to], zones[from]];
  return layoutLanes({ ...d, zones });
}

/** Removes a lane with its steps and their connections; the lanes below move up. */
export function removeLane(d: Diagram, id: string): Diagram {
  const gone = new Set([
    id,
    ...d.boxes.filter((box) => box.parentId === id).map((box) => box.id),
  ]);
  return layoutLanes({
    ...d,
    zones: d.zones.filter((lane) => lane.id !== id),
    boxes: d.boxes.filter((box) => !gone.has(box.id)),
    lines: d.lines.filter((line) => !gone.has(line.from) && !gone.has(line.to)),
  });
}

/** Only an approval step says who approves (left out when blank). */
const approverOf = (box: Box): Box =>
  withText(box, "approver", box.type === "approval" ? box.approver : undefined);

export function addStep(
  d: Diagram,
  {
    label,
    type,
    laneId,
    approver,
  }: { label: string; type: ProcessStep; laneId: string; approver?: string },
): Diagram {
  const added = addBox(
    d,
    { label, type, parentId: laneId },
    laneSpot(d, laneId),
  );
  const step = approverOf({
    ...added.boxes[added.boxes.length - 1],
    approver: approver?.trim(),
  });
  return layoutLanes({ ...added, boxes: [...d.boxes, step] });
}

/** Changes a step; one moved to another lane goes to the right of that lane's last step. */
export function updateStep(
  d: Diagram,
  id: string,
  patch: Partial<Pick<Box, "label" | "type" | "parentId" | "approver">>,
): Diagram {
  const changed = (box: Box): Box => {
    const moved =
      patch.parentId !== undefined && patch.parentId !== box.parentId;
    return approverOf({
      ...box,
      ...patch,
      ...(moved ? laneSpot(d, patch.parentId!) : {}),
    });
  };
  return layoutLanes({
    ...d,
    boxes: d.boxes.map((box) => (box.id === id ? changed(box) : box)),
  });
}

/** Approval steps that do not yet say who approves (needed before submit). */
export function unnamedApprovals(d: Diagram): Box[] {
  return d.boxes.filter(
    (box) => box.type === "approval" && !box.approver?.trim(),
  );
}
