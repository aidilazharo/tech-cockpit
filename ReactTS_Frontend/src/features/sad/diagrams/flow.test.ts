import { getSmoothStepPath, Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { Diagram } from "../schemas";
import {
  addBox,
  addLine,
  addZone,
  BOX_HEIGHT,
  BOX_WIDTH,
  emptyDiagram,
  moveItem,
} from "./model";
import { autoSides, editFrom, linePath, toFlow } from "./flow";

const drawn = (sizing: Diagram["sizing"] = "auto") => {
  let d: Diagram = { ...emptyDiagram("d", "Solution diagram"), sizing };
  d = addZone(d, { label: "Inner", parentId: undefined });
  d = addZone(d, { label: "Outer" });
  d = moveItem(d, "zone-2", 0, 400);
  // Children listed before their parent, to check React Flow still gets parents first.
  d = { ...d, zones: [{ ...d.zones[0], parentId: "zone-2" }, d.zones[1]] };
  d = addBox(d, { label: "App", type: "web", parentId: "zone-1" });
  d = addBox(d, { label: "Bank", type: "external" });
  d = moveItem(d, "box-2", 600, 0);
  d = addLine(d, {
    from: "box-1",
    to: "box-2",
    label: "Payment API",
    dashed: true,
    twoWay: true,
  });
  return addLine(d, { from: "box-2", to: "zone-2" });
};

describe("toFlow", () => {
  it("puts parents before children and gives every node its known size, so React Flow need not measure it again after each edit", () => {
    const d = drawn();
    const { nodes } = toFlow(d, { selected: "box-1", editable: true });
    expect(nodes.map((n) => n.id)).toEqual([
      "zone-2",
      "zone-1",
      "box-1",
      "box-2",
    ]);
    const box = nodes.find((n) => n.id === "box-1")!;
    expect(box).toMatchObject({
      type: "box",
      parentId: "zone-1",
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
      measured: { width: BOX_WIDTH, height: BOX_HEIGHT },
      selected: true,
      data: { label: "App", type: "web" },
    });
    const outer = d.zones.find((z) => z.id === "zone-2")!;
    expect(nodes.find((n) => n.id === "zone-2")).toMatchObject({
      type: "zone",
      measured: { width: outer.width, height: outer.height },
      data: { label: "Outer", empty: false, resizable: false },
    });
  });

  it("lets boxes and zones go past their zone's right and bottom edge (it grows), however zones are sized", () => {
    for (const sizing of ["auto", "manual"] as const) {
      expect(
        toFlow(drawn(sizing), { selected: null, editable: true }).nodes.find(
          (n) => n.id === "box-1",
        )!.extent,
      ).toEqual([
        [8, 30],
        [1e6, 1e6],
      ]);
    }
    const manual = toFlow(drawn("manual"), {
      selected: "zone-2",
      editable: true,
    }).nodes;
    expect(manual.find((n) => n.id === "zone-1")!.extent).toEqual([
      [8, 30],
      [1e6, 1e6],
    ]);
    expect(manual.find((n) => n.id === "zone-2")!.data).toMatchObject({
      resizable: true,
    });
    expect(
      toFlow(drawn("manual"), {
        selected: "zone-2",
        editable: false,
      }).nodes.find((n) => n.id === "zone-2")!.data,
    ).toMatchObject({ resizable: false });
  });

  it("carries what changed between two versions to the zones, boxes and lines it marks", () => {
    const marks = new Map([
      ["zone-2", "changed" as const],
      ["box-1", "added" as const],
      ["line-1", "removed" as const],
    ]);
    const { nodes, edges } = toFlow(drawn(), {
      selected: null,
      editable: false,
      marks,
    });
    expect(nodes.map((node) => [node.id, node.data.change])).toEqual([
      ["zone-2", "changed"],
      ["zone-1", undefined],
      ["box-1", "added"],
      ["box-2", undefined],
    ]);
    expect(edges.map((edge) => edge.data!.change)).toEqual([
      "removed",
      undefined,
    ]);
  });

  it("draws lines with arrows, two-way ones at both ends, choosing sides from where things sit", () => {
    const { edges } = toFlow(drawn(), { selected: "line-1", editable: true });
    expect(edges[0]).toMatchObject({
      id: "line-1",
      source: "box-1",
      target: "box-2",
      sourceHandle: "r",
      targetHandle: "l",
      selected: true,
      data: { label: "Payment API", dashed: true },
    });
    expect(edges[0].markerStart).toBeDefined();
    expect(edges[1]).toMatchObject({ sourceHandle: "l", targetHandle: "r" });
    expect(edges[1].markerStart).toBeUndefined();
  });

  it("labels lines as the view asks, marking those still missing facts", () => {
    const lineLabel = (line: Diagram["lines"][number]) => ({
      label: `#${line.id}`,
      missing: line.id === "line-2",
    });
    const { edges } = toFlow(drawn(), {
      selected: null,
      editable: false,
      lineLabel,
    });
    expect(edges.map((edge) => edge.data)).toEqual([
      { label: "#line-1", dashed: true, missing: false },
      { label: "#line-2", dashed: undefined, missing: true },
    ]);
  });

  it("gives a block picked from TRM its APM number", () => {
    const d = addBox(emptyDiagram("d", "Solution diagram"), {
      label: "Billing",
      type: "business",
      application: {
        id: "ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1",
        number: "APM-Billing",
      },
    });
    expect(
      toFlow(d, { selected: null, editable: false }).nodes[0].data,
    ).toEqual({ label: "Billing", type: "business", trm: "APM-Billing" });
    const server = addBox(d, {
      label: "SRV-CRM-01",
      type: "server",
      server: { id: "5a27be1d-59d9-47d2-8070-6f33504dd0fb" },
    });
    expect(
      toFlow(server, { selected: null, editable: false }).nodes[1].data,
    ).toEqual({ label: "SRV-CRM-01", type: "server", server: true });
    const typed = addBox(d, { label: "Old CRM", type: "business" });
    expect(
      toFlow(typed, { selected: null, editable: false }).nodes[1].data,
    ).toEqual({ label: "Old CRM", type: "business" });
  });

  it("keeps the sides an author chose", () => {
    const d = drawn();
    expect(autoSides(d, { ...d.lines[0], fromSide: "t", toSide: "t" })).toEqual(
      ["t", "t"],
    );
    expect(autoSides(d, { id: "x", from: "box-2", to: "box-1" })).toEqual([
      "l",
      "r",
    ]);
    expect(autoSides(d, { id: "x", from: "zone-2", to: "box-2" })).toEqual([
      "r",
      "l",
    ]);
    const above = moveItem(d, "box-2", 60, -400);
    expect(autoSides(above, { id: "x", from: "zone-2", to: "box-2" })).toEqual([
      "t",
      "b",
    ]);
    expect(autoSides(above, { id: "x", from: "box-2", to: "zone-2" })).toEqual([
      "b",
      "t",
    ]);
  });
});

describe("lines between the same two things", () => {
  /** CRM and Billing side by side, with `count` lines between them, every second one the other way. */
  const pair = (count: number) => {
    let d: Diagram = emptyDiagram("d", "Solution diagram");
    d = addBox(d, { label: "CRM", type: "web" });
    d = addBox(d, { label: "Billing", type: "web" });
    d = moveItem(d, "box-2", 600, 0);
    for (let i = 0; i < count; i++)
      d =
        i % 2
          ? addLine(d, { from: "box-2", to: "box-1" })
          : addLine(d, { from: "box-1", to: "box-2" });
    return d;
  };
  const spreads = (d: Diagram) =>
    toFlow(d, { selected: null, editable: false }).edges.map(
      (edge) => (edge.data as { spread?: unknown }).spread ?? null,
    );

  it("spreads them across the sides they share and along the way, whichever way each goes, so none is drawn over another", () => {
    // Positions along the way are measured from each line's own start: the second line runs from Billing.
    expect(spreads(pair(2))).toEqual([
      { offset: -16, at: 0.25 },
      { offset: 16, at: 0.25 },
    ]);
    expect(spreads(pair(3))).toEqual([
      { offset: -24, at: 0.5 / 3 },
      { offset: 0, at: 0.5 },
      { offset: 24, at: 2.5 / 3 },
    ]);
  });

  it("keeps many on the boxes' sides, and leaves a line alone when it is the only one there", () => {
    expect(
      spreads(pair(5)).map((spread) => (spread as { offset: number }).offset),
    ).toEqual([-24, -12, 0, 12, 24]);
    // One above the other, lines share the wider bottom and top sides.
    const stacked = moveItem(pair(7), "box-2", 0, 300);
    expect(
      spreads(stacked).map((spread) => (spread as { offset: number }).offset),
    ).toEqual([-80, -160 / 3, -80 / 3, 0, 80 / 3, 160 / 3, 80]);
    expect(spreads(pair(1))).toEqual([null]);
    const otherSides = pair(2);
    otherSides.lines[1] = {
      ...otherSides.lines[1],
      fromSide: "b",
      toSide: "b",
    };
    expect(spreads(otherSides)).toEqual([null, null]);
  });
});

describe("linePath", () => {
  const across = {
    sourceX: 100,
    sourceY: 50,
    sourcePosition: Position.Right,
    targetX: 300,
    targetY: 50,
    targetPosition: Position.Left,
  };

  it("is React Flow's smooth step for a line on its own", () => {
    expect(linePath(across)).toEqual(
      getSmoothStepPath({ ...across, borderRadius: 10 }).slice(0, 3),
    );
  });

  it("moves a spread line's ends across their sides, and its bend and label along the way", () => {
    const [path, x, y] = linePath(across, { offset: 16, at: 0.25 });
    expect(path.startsWith("M100 66")).toBe(true);
    // React Flow keeps 20 clear of each end: the way runs from 120 to 280.
    expect([x, y]).toEqual([160, 66]);
    const down = {
      sourceX: 50,
      sourceY: 100,
      sourcePosition: Position.Bottom,
      targetX: 50,
      targetY: 300,
      targetPosition: Position.Top,
    };
    expect(linePath(down, { offset: -16, at: 0.75 }).slice(1)).toEqual([
      34, 240,
    ]);
  });
});

describe("editFrom", () => {
  it("turns drags, resizes and selection into edits, ignoring the rest", () => {
    expect(
      editFrom({
        type: "position",
        id: "b",
        position: { x: 10.4, y: 20.6 },
        dragging: true,
      }),
    ).toEqual({ kind: "move", id: "b", x: 10, y: 21, dragging: true });
    expect(
      editFrom({
        type: "position",
        id: "b",
        position: { x: 10, y: 20 },
        dragging: false,
      }),
    ).toEqual({ kind: "move", id: "b", x: 10, y: 20, dragging: false });
    // Resizing from a top or left corner moves the zone too, without a drag.
    expect(
      editFrom({ type: "position", id: "z", position: { x: 5, y: 6 } }),
    ).toEqual({ kind: "move", id: "z", x: 5, y: 6 });
    expect(editFrom({ type: "position", id: "b" })).toBeNull();
    expect(
      editFrom({
        type: "dimensions",
        id: "z",
        dimensions: { width: 300, height: 200 },
        resizing: true,
      }),
    ).toEqual({ kind: "resize", id: "z", width: 300, height: 200 });
    expect(
      editFrom({
        type: "dimensions",
        id: "z",
        dimensions: { width: 300, height: 200 },
      }),
    ).toBeNull();
    expect(editFrom({ type: "select", id: "z", selected: true })).toEqual({
      kind: "select",
      id: "z",
    });
    expect(editFrom({ type: "select", id: "z", selected: false })).toBeNull();
    expect(editFrom({ type: "remove", id: "z" })).toBeNull();
  });
});
