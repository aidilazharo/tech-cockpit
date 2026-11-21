import { describe, expect, it } from "vitest";
import type { Diagram } from "../schemas";
import { addLine, emptyDiagram, moveItem, resizeZone } from "./model";
import {
  addLane,
  addStep,
  layoutLanes,
  moveLane,
  removeLane,
  unnamedApprovals,
  updateStep,
} from "./process";

/** A CI flow with the Developer and Azure DevOps lanes. */
const lanes = (): Diagram =>
  addLane(addLane(emptyDiagram("ci", "CI flow"), "Developer"), "Azure DevOps");
const places = (d: Diagram) =>
  d.zones.map((zone) => [zone.label, zone.x, zone.y, zone.width, zone.height]);

describe("CI and CD flow lanes", () => {
  it("are stacked top to bottom in their order, each as wide as the widest and tall enough for its steps", () => {
    let d = lanes();
    expect(d.zones.map((zone) => [zone.id, zone.kind])).toEqual([
      ["zone-1", "lane"],
      ["zone-2", "lane"],
    ]);
    expect(places(d)).toEqual([
      ["Developer", 0, 0, 640, 140],
      ["Azure DevOps", 0, 140, 640, 140],
    ]);
    for (const label of ["Code change", "Open pull request", "Review", "Merge"])
      d = addStep(d, { label, type: "step", laneId: "zone-1" });
    // Each new step goes to the right of the lane's last one.
    expect(
      d.boxes.map((box) => [box.label, box.parentId, box.x, box.y]),
    ).toEqual([
      ["Code change", "zone-1", 40, 40],
      ["Open pull request", "zone-1", 276, 40],
      ["Review", "zone-1", 512, 40],
      ["Merge", "zone-1", 748, 40],
    ]);
    d = layoutLanes(moveItem(d, "box-4", 748, 200));
    expect(places(d)).toEqual([
      ["Developer", 0, 0, 964, 284],
      ["Azure DevOps", 0, 284, 964, 140],
    ]);
  });

  it("move up or down one place at a time, staying put at the top and bottom", () => {
    const up = moveLane(lanes(), "zone-2", -1);
    expect(places(up).map(([label, , y]) => [label, y])).toEqual([
      ["Azure DevOps", 0],
      ["Developer", 140],
    ]);
    expect(moveLane(up, "zone-2", -1)).toEqual(up);
    expect(moveLane(up, "zone-1", 1)).toEqual(up);
    expect(moveLane(up, "zone-2", 1)).toEqual(lanes());
  });

  it("keep the sizes an author set by hand, growing (never shrinking) to fit a step past their edge, and are stacked again", () => {
    let d = layoutLanes(
      resizeZone({ ...lanes(), sizing: "manual" }, "zone-1", 900, 300),
    );
    expect(places(d)).toEqual([
      ["Developer", 0, 0, 900, 300],
      ["Azure DevOps", 0, 300, 640, 140],
    ]);
    d = addStep(d, { label: "Build", type: "step", laneId: "zone-2" });
    d = layoutLanes(moveItem(d, "box-1", 700, 200));
    expect(places(d)).toEqual([
      ["Developer", 0, 0, 900, 300],
      ["Azure DevOps", 0, 300, 700 + 176 + 40, 200 + 64 + 20],
    ]);
    expect(places(layoutLanes(moveItem(d, "box-1", 40, 40)))[1]).toEqual([
      "Azure DevOps",
      0,
      300,
      700 + 176 + 40,
      200 + 64 + 20,
    ]);
  });

  it("close up when one is removed, which takes its steps and their connections with it", () => {
    let d = addStep(lanes(), {
      label: "Code change",
      type: "start",
      laneId: "zone-1",
    });
    d = addStep(d, { label: "Build", type: "step", laneId: "zone-2" });
    d = removeLane(
      addLine(addLine(d, { from: "box-1", to: "box-2" }), {
        from: "box-2",
        to: "box-1",
      }),
      "zone-1",
    );
    expect(places(d)).toEqual([["Azure DevOps", 0, 0, 640, 140]]);
    expect(d.boxes.map((box) => box.label)).toEqual(["Build"]);
    expect(d.lines).toEqual([]);
  });
});

describe("CI and CD flow steps", () => {
  it("record who approves on approval steps only", () => {
    let d = addStep(lanes(), {
      label: "Change approved?",
      type: "approval",
      laneId: "zone-2",
      approver: " CAB ",
    });
    expect(d.boxes[0]).toMatchObject({
      type: "approval",
      approver: "CAB",
      parentId: "zone-2",
      x: 40,
      y: 40,
    });
    d = updateStep(d, "box-1", { approver: "" });
    expect(d.boxes[0]).not.toHaveProperty("approver");
    d = updateStep(
      updateStep(d, "box-1", { approver: "Application manager" }),
      "box-1",
      { type: "decision" },
    );
    expect(d.boxes[0]).toMatchObject({ type: "decision" });
    expect(d.boxes[0]).not.toHaveProperty("approver");
    expect(
      addStep(lanes(), {
        label: "Build",
        type: "step",
        laneId: "zone-1",
        approver: "CAB",
      }).boxes[0],
    ).not.toHaveProperty("approver");
  });

  it("go to the end of the lane they move to", () => {
    let d = addStep(lanes(), {
      label: "Build",
      type: "step",
      laneId: "zone-2",
    });
    d = addStep(d, { label: "Code change", type: "start", laneId: "zone-1" });
    d = updateStep(d, "box-2", { parentId: "zone-2", label: "Code pushed" });
    expect(d.boxes[1]).toMatchObject({
      label: "Code pushed",
      parentId: "zone-2",
      x: 276,
      y: 40,
    });
    expect(updateStep(d, "box-2", { parentId: "zone-2" })).toEqual(d);
  });

  it("list the approvals that do not yet say who approves", () => {
    let d = addStep(lanes(), {
      label: "Change approved?",
      type: "approval",
      laneId: "zone-2",
    });
    d = addStep(d, {
      label: "Release approved?",
      type: "approval",
      laneId: "zone-2",
      approver: "CAB",
    });
    d = addStep(d, {
      label: "Within policy?",
      type: "decision",
      laneId: "zone-2",
    });
    expect(unnamedApprovals(d).map((box) => box.label)).toEqual([
      "Change approved?",
    ]);
  });
});
