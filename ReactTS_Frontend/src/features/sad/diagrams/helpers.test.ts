import { describe, expect, it, vi } from "vitest";
import type { Diagram } from "../schemas";
import { canvasEdits } from "./helpers";
import { addBox, addZone, emptyDiagram } from "./model";

const twoBoxes = (): Diagram => {
  let d = addZone(emptyDiagram("d", "Solution diagram"), { label: "vnet" });
  d = addBox(d, { label: "a", type: "web", parentId: "zone-1" });
  return addBox(d, { label: "b", type: "web", parentId: "zone-1" });
};
const changed = (change: ReturnType<typeof vi.fn>) => {
  const [fn, options] = change.mock.calls.at(-1)!;
  return { d: (fn as (d: Diagram) => Diagram)(twoBoxes()), options };
};

describe("edits from the canvas", () => {
  it("moves an item where it is dragged, saying a drag is going on, without snapping it yet", () => {
    const change = vi.fn();
    canvasEdits(
      twoBoxes(),
      change,
      vi.fn(),
    )([{ kind: "move", id: "box-2", x: 100, y: 50, dragging: true }]);
    const { d, options } = changed(change);
    expect(d.boxes[1]).toMatchObject({ x: 100, y: 50 });
    expect(options).toEqual({ dragging: true });
  });

  it("snaps an item dropped on another to the nearest free spot", () => {
    const change = vi.fn();
    canvasEdits(
      twoBoxes(),
      change,
      vi.fn(),
    )([{ kind: "move", id: "box-2", x: 100, y: 50, dragging: false }]);
    const { d, options } = changed(change);
    expect(d.boxes[1]).toMatchObject({ x: 100, y: 134 });
    expect(options).toEqual({ dragging: false });
  });

  it("resizes zones and selects, and changes nothing when only selecting or when the diagram cannot change", () => {
    const change = vi.fn();
    const select = vi.fn();
    canvasEdits(
      twoBoxes(),
      change,
      select,
    )([{ kind: "resize", id: "zone-1", width: 900, height: 300 }]);
    expect(changed(change).d.zones[0]).toMatchObject({
      width: 900,
      height: 300,
    });
    canvasEdits(twoBoxes(), change, select)([{ kind: "select", id: "box-1" }]);
    expect(select).toHaveBeenCalledWith("box-1");
    expect(change).toHaveBeenCalledTimes(1);
    canvasEdits(
      twoBoxes(),
      undefined,
      select,
    )([{ kind: "move", id: "box-2", x: 1, y: 1 }]);
  });
});
