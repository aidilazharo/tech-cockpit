import { describe, expect, it } from "vitest";
import type { Diagram, DiagramContent } from "../schemas";
import {
  addBlock,
  addBox,
  addDiagram,
  addLine,
  addZone,
  answered,
  dataFactsLost,
  hiddenLost,
  missingFacts,
  autoFit,
  BOX_HEIGHT,
  BOX_WIDTH,
  emptyContent,
  emptyDiagram,
  EMPTY_ZONE_HEIGHT,
  moveItem,
  removeDiagram,
  removeItem,
  resizeZone,
  snapToFree,
  updateBox,
  updateDiagram,
  updateLine,
  updateZone,
} from "./model";

const base = (extra: Partial<Diagram> = {}): Diagram => ({
  ...emptyDiagram("d1", "Solution diagram"),
  ...extra,
});

describe("ids of new items", () => {
  it("never takes an id taken by lines the editor cannot see, or by saved items removed since", () => {
    // Saved: box-1 and box-2, line-1; section 2's hidden integration connection is line-2.
    const saved = base({
      boxes: [
        { id: "box-1", label: "A", type: "server", x: 0, y: 0 },
        { id: "box-2", label: "B", type: "server", x: 0, y: 0 },
      ],
      lines: [{ id: "line-1", from: "box-1", to: "box-2" }],
      taken: ["line-2", "box-1", "box-2", "line-1"],
    });
    let d = removeItem(saved, "box-2");
    d = addBox(d, { label: "C", type: "server" });
    d = addLine(d, { from: "box-1", to: "box-3" });
    expect([
      d.boxes.map((box) => box.id),
      d.lines.map((line) => line.id),
    ]).toEqual([["box-1", "box-3"], ["line-3"]]);
    expect(addZone(d, { label: "Z" }).zones.map((zone) => zone.id)).toEqual([
      "zone-1",
    ]);
  });
});

describe("what a removal takes that the editor cannot see", () => {
  it("names the views whose lines or facts go with an item: its own, and those of the lines removed with it", () => {
    const d = base({
      boxes: [
        { id: "a", label: "A", type: "part", x: 0, y: 0 },
        { id: "b", label: "B", type: "part", x: 0, y: 0 },
        { id: "c", label: "C", type: "part", x: 0, y: 0 },
      ],
      lines: [
        { id: "l1", from: "a", to: "b" },
        { id: "l2", from: "b", to: "c" },
      ],
    });
    const carriers = [
      { id: "l1", view: "data-flow" as const },
      { id: "c", view: "integration" as const },
    ];
    expect(hiddenLost(d, "l1", carriers)).toEqual(["data-flow"]);
    expect(hiddenLost(d, "a", carriers)).toEqual(["data-flow"]);
    expect(hiddenLost(d, "c", carriers)).toEqual(["integration"]);
    expect(hiddenLost(d, "b", carriers)).toEqual(["data-flow"]);
    expect(hiddenLost(d, "l2", carriers)).toEqual([]);
    expect(hiddenLost(d, "a", [])).toEqual([]);
  });
});

describe("adding", () => {
  it("gives each new zone, box and line its own id and a free spot", () => {
    let d = addZone(base(), { label: "CRM", kind: "This application" });
    d = addZone(d, { label: "Web subnet", parentId: "zone-1" });
    d = addBox(d, { label: "Portal", type: "web", parentId: "zone-2" });
    d = addBox(d, { label: "Bank", type: "external" });
    d = addLine(d, {
      from: "box-1",
      to: "box-2",
      label: "Payment API",
      twoWay: true,
    });
    expect(d.zones.map((z) => [z.id, z.label, z.parentId ?? null])).toEqual([
      ["zone-1", "CRM", null],
      ["zone-2", "Web subnet", "zone-1"],
    ]);
    expect(d.zones[0].kind).toBe("This application");
    expect(d.boxes.map((b) => [b.id, b.parentId ?? null, b.type])).toEqual([
      ["box-1", "zone-2", "web"],
      ["box-2", null, "external"],
    ]);
    expect(d.lines).toEqual([
      {
        id: "line-1",
        from: "box-1",
        to: "box-2",
        label: "Payment API",
        twoWay: true,
      },
    ]);
    // Inside a zone, the first thing sits under its name; top-level things go below what is already there.
    expect([d.boxes[0].x, d.boxes[0].y]).toEqual([20, 40]);
    expect(d.boxes[1].y).toBeGreaterThan(d.zones[0].y);
  });

  it("counts ids on from the highest one, even after something was removed", () => {
    let d = addBox(addBox(base(), { label: "A", type: "web" }), {
      label: "B",
      type: "web",
    });
    d = removeItem(d, "box-1");
    d = addBox(d, { label: "C", type: "web" });
    expect(d.boxes.map((b) => b.id)).toEqual(["box-2", "box-3"]);
  });

  it("leaves out an empty line label and plain line styles", () => {
    expect(
      addLine(base(), {
        from: "a",
        to: "b",
        label: "  ",
        dashed: false,
        twoWay: false,
      }).lines[0],
    ).toEqual({ id: "line-1", from: "a", to: "b" });
    expect(
      addLine(base(), { from: "a", to: "b", dashed: true }).lines[0],
    ).toEqual({ id: "line-1", from: "a", to: "b", dashed: true });
  });
});

describe("where a new zone or box goes inside a zone", () => {
  const at = (d: Diagram, id: string) => {
    const item = [...d.zones, ...d.boxes].find((thing) => thing.id === id)!;
    return [item.x, item.y];
  };
  const vnet = () => addZone(base(), { label: "vnet-crm" });

  it("fills it row by row, wrapping before a row passes 800px, and fills a gap left behind first", () => {
    let d = vnet();
    for (const label of ["a", "b", "c", "d", "e"])
      d = addBox(d, { label, type: "web", parentId: "zone-1" });
    expect(d.boxes.map((box) => [box.x, box.y])).toEqual([
      [20, 40],
      [226, 40],
      [432, 40],
      [638, 40],
      [20, 40 + BOX_HEIGHT + 30],
    ]);
    d = addBox(removeItem(d, "box-2"), {
      label: "f",
      type: "web",
      parentId: "zone-1",
    });
    expect(at(d, "box-6")).toEqual([226, 40]);
  });

  it("puts zones first and boxes in the rows under them; a box level with a new zone row moves below it", () => {
    let d = addBox(vnet(), { label: "apim", type: "web", parentId: "zone-1" });
    d = autoFit(
      addZone(d, { label: "snet-app", kind: "Subnet", parentId: "zone-1" }),
    );
    const subnet = d.zones[1];
    expect([subnet.x, subnet.y]).toEqual([20, 40]);
    expect(at(d, "box-1")).toEqual([20, 40 + EMPTY_ZONE_HEIGHT + 30]);
    d = addBox(d, { label: "kv", type: "web", parentId: "zone-1" });
    expect(at(d, "box-2")).toEqual([
      20 + BOX_WIDTH + 30,
      40 + EMPTY_ZONE_HEIGHT + 30,
    ]);
    d = addZone(d, { label: "snet-db", kind: "Subnet", parentId: "zone-1" });
    expect(at(d, "zone-3")).toEqual([20 + subnet.width + 30, 40]);
  });

  it("gives an item wider than a row a row of its own", () => {
    let d = addZone(vnet(), { label: "snet-app", parentId: "zone-1" });
    d = resizeZone(addZone(d, { label: "wide" }), "zone-3", 900, 40);
    expect(
      at(updateZone(d, "zone-3", { parentId: "zone-1" }), "zone-3"),
    ).toEqual([20, 40 + 160 + 30]);
  });

  it("sizes a new zone as it will be: empty under Automatic, 300 by 160 By hand", () => {
    const wide = (sizing: Diagram["sizing"]) =>
      resizeZone(
        addZone(addZone({ ...base(), sizing }, { label: "vnet" }), {
          label: "snet-a",
          parentId: "zone-1",
        }),
        "zone-2",
        500,
        40,
      );
    expect(
      at(addZone(wide("auto"), { label: "B", parentId: "zone-1" }), "zone-3"),
    ).toEqual([20 + 500 + 30, 40]);
    expect(
      at(addZone(wide("manual"), { label: "B", parentId: "zone-1" }), "zone-3"),
    ).toEqual([20, 40 + 40 + 30]);
  });

  it("puts a top-level item below everything, as before", () => {
    const d = addZone(base(), { label: "Internet" });
    expect(at(d, "zone-1")).toEqual([0, 0]);
    expect(at(addZone(d, { label: "Azure global" }), "zone-2")).toEqual([
      0,
      d.zones[0].height + 30,
    ]);
  });

  it("moves a zone or box into another zone at its first free slot", () => {
    let d = addBox(addZone(vnet(), { label: "snet-app", parentId: "zone-1" }), {
      label: "apim",
      type: "web",
    });
    d = addZone(d, { label: "snet-db" });
    d = updateBox(d, "box-1", { parentId: "zone-1" });
    expect(at(d, "box-1")).toEqual([20, 40 + 160 + 30]);
    expect(
      at(updateZone(d, "zone-3", { parentId: "zone-1" }), "zone-3"),
    ).toEqual([20 + 300 + 30, 40]);
  });
});

describe("changing", () => {
  const drawn = () => {
    let d = addZone(base(), { label: "Region" });
    d = addZone(d, { label: "Subnet", parentId: "zone-1" });
    d = addBox(d, { label: "App", type: "web", parentId: "zone-2" });
    d = addBox(d, { label: "Bank", type: "external" });
    return addLine(d, { from: "box-1", to: "box-2" });
  };

  it("renames and retypes, and moving into another zone puts the box inside it", () => {
    let d = updateBox(drawn(), "box-2", { label: "Bank gateway", type: "api" });
    expect(d.boxes[1]).toMatchObject({ label: "Bank gateway", type: "api" });
    d = updateBox(d, "box-2", { parentId: "zone-1" });
    expect(d.boxes[1]).toMatchObject({ parentId: "zone-1", x: 20 });
    d = updateBox(d, "box-2", { parentId: undefined });
    expect(d.boxes[1].parentId).toBeUndefined();
    d = updateZone(d, "zone-2", { label: "snet-app", kind: "Subnet" });
    expect(d.zones[1]).toMatchObject({ label: "snet-app", kind: "Subnet" });
    d = updateLine(d, "line-1", { label: "HTTPS", dashed: true });
    expect(d.lines[0]).toMatchObject({ label: "HTTPS", dashed: true });
    expect(updateLine(d, "line-1", { twoWay: true }).lines[0]).toMatchObject({
      label: "HTTPS",
      dashed: true,
      twoWay: true,
    });
    const two = addLine(d, { from: "zone-1", to: "box-2" });
    expect(updateLine(two, "line-1", { label: "TLS" }).lines[1]).toBe(
      two.lines[1],
    );
  });

  it("refuses to put a zone inside itself or one of its own zones", () => {
    const d = drawn();
    expect(updateZone(d, "zone-1", { parentId: "zone-2" })).toBe(d);
    expect(updateZone(d, "zone-1", { parentId: "zone-1" })).toBe(d);
    expect(
      updateZone(d, "zone-2", { parentId: undefined }).zones[1].parentId,
    ).toBeUndefined();
  });

  it("moves and resizes", () => {
    let d = moveItem(drawn(), "box-2", 300, 120);
    expect(d.boxes[1]).toMatchObject({ x: 300, y: 120 });
    d = moveItem(d, "zone-1", 5, 6);
    expect(d.zones[0]).toMatchObject({ x: 5, y: 6 });
    d = resizeZone(d, "zone-1", 500, 10);
    expect(d.zones[0]).toMatchObject({ width: 500, height: 20 });
    expect(moveItem(d, "missing", 1, 1)).toBe(d);
  });

  it("removing a zone keeps what was inside it where it was, and drops lines to removed things", () => {
    const d = addLine(drawn(), { from: "zone-2", to: "box-2" });
    const zoneGone = removeItem(d, "zone-2");
    expect(zoneGone.zones.map((z) => z.id)).toEqual(["zone-1"]);
    // The box moves up to the removed zone's parent, keeping its place on the canvas.
    expect(zoneGone.boxes[0]).toMatchObject({
      parentId: "zone-1",
      x: d.zones[1].x + d.boxes[0].x,
      y: d.zones[1].y + d.boxes[0].y,
    });
    expect(zoneGone.lines.map((l) => l.id)).toEqual(["line-1"]);
    const topGone = removeItem(zoneGone, "zone-1");
    expect(topGone.boxes[0].parentId).toBeUndefined();
    expect(removeItem(d, "box-2").lines).toEqual([]);
    expect(removeItem(d, "line-1").lines.map((l) => l.id)).toEqual(["line-2"]);
  });
});

describe("automatic zone sizes", () => {
  it("fits each zone around what it holds, deepest first, and shrinks an empty zone to its name", () => {
    let d = addZone(base(), { label: "Region" });
    d = addZone(d, { label: "Subnet", parentId: "zone-1" });
    d = addBox(d, { label: "App", type: "web", parentId: "zone-2" });
    d = addZone(d, { label: "Empty", kind: "DR" });
    const fitted = autoFit(d);
    const [region, subnet, empty] = fitted.zones;
    expect(subnet.width).toBe(20 + BOX_WIDTH + 20);
    expect(subnet.height).toBe(40 + BOX_HEIGHT + 20);
    expect(region.width).toBe(subnet.x + subnet.width + 20);
    expect(empty.height).toBe(EMPTY_ZONE_HEIGHT);
    expect(empty.width).toBeGreaterThan(100);
  });

  it("pushes a zone that would overlap a grown neighbour to the right, or below", () => {
    let d = addZone(base(), { label: "Primary" });
    d = addZone(d, { label: "DR" });
    d = moveItem(d, "zone-2", 400, 0);
    d = addBox(d, { label: "App", type: "web", parentId: "zone-1" });
    d = moveItem(d, "box-1", 400, 40);
    const right = autoFit(d);
    expect(right.zones[1].x).toBe(right.zones[0].x + right.zones[0].width + 30);
    const below = autoFit(moveItem(d, "zone-2", 10, 10));
    expect(below.zones[1].y).toBe(
      below.zones[0].y + below.zones[0].height + 30,
    );
  });

  it("keeps a row of zones together under a zone that grows taller: each moves down, 30px apart", () => {
    let d = addZone(base(), { label: "Subscription" });
    d = resizeZone(d, "zone-1", 300, 40);
    d = addZone(d, { label: "PDC" });
    d = addZone(d, { label: "Office network" });
    // The office network starts past the middle of the subscription (once it fits its box): it used to go to the side.
    d = moveItem(moveItem(d, "zone-2", 0, 70), "zone-3", 200, 70);
    d = addBox(d, { label: "Web", type: "web", parentId: "zone-1" });
    const fitted = autoFit(d);
    const [subscription, pdc, office] = fitted.zones;
    const below = subscription.y + subscription.height + 30;
    expect([pdc.x, pdc.y, office.x, office.y]).toEqual([
      0,
      below,
      pdc.width + 30,
      below,
    ]);
  });

  // The subnet holds two servers; the API Management box sits in the VNet under it (the overlap authors saw).
  const grownSubnet = (): Diagram => ({
    ...base(),
    zones: [
      { id: "vnet", label: "vnet-crm", x: 0, y: 0, width: 400, height: 300 },
      {
        id: "snet",
        label: "snet-app",
        parentId: "vnet",
        x: 20,
        y: 40,
        width: 216,
        height: 124,
      },
    ],
    boxes: [
      {
        id: "vm-1",
        label: "vm-1",
        type: "server",
        parentId: "snet",
        x: 20,
        y: 40,
      },
      {
        id: "vm-2",
        label: "vm-2",
        type: "server",
        parentId: "snet",
        x: 20,
        y: 134,
      },
      {
        id: "apim",
        label: "apim",
        type: "azure",
        parentId: "vnet",
        x: 20,
        y: 150,
      },
    ],
  });

  it("moves the boxes under a zone that grows down below it, 30px clear, which also fixes overlaps already saved", () => {
    const fitted = autoFit(grownSubnet());
    const subnet = fitted.zones[1];
    expect(subnet.height).toBe(134 + BOX_HEIGHT + 20);
    expect(fitted.boxes[2]).toMatchObject({
      x: 20,
      y: subnet.y + subnet.height + 30,
    });
  });

  it("moves apart neighbours closer than 30px, and leaves them while an item is being dragged", () => {
    const d = {
      ...grownSubnet(),
      boxes: [
        ...grownSubnet().boxes.slice(0, 2),
        {
          id: "web",
          label: "web",
          type: "azure",
          parentId: "snet",
          x: 206,
          y: 40,
        },
      ],
    };
    expect(autoFit(d).boxes[2]).toMatchObject({
      x: 20 + BOX_WIDTH + 30,
      y: 40,
    });
    expect(autoFit(d, { push: false }).boxes[2]).toMatchObject({
      x: 206,
      y: 40,
    });
  });
});

describe("zones sized by hand", () => {
  // MY01 › Southeast Asia › vnet-crm › snet-app, with East Asia beside Southeast Asia.
  const nested = (): Diagram => ({
    ...base(),
    sizing: "manual",
    zones: [
      { id: "my01", label: "MY01", x: 0, y: 0, width: 800, height: 300 },
      {
        id: "sea",
        label: "Southeast Asia",
        parentId: "my01",
        x: 20,
        y: 40,
        width: 300,
        height: 200,
      },
      {
        id: "ea",
        label: "East Asia",
        parentId: "my01",
        x: 350,
        y: 40,
        width: 300,
        height: 200,
      },
      {
        id: "vnet",
        label: "vnet-crm",
        parentId: "sea",
        x: 20,
        y: 40,
        width: 200,
        height: 100,
      },
      {
        id: "snet",
        label: "snet-app",
        parentId: "vnet",
        x: 20,
        y: 40,
        width: 100,
        height: 50,
      },
      { id: "pdc", label: "PDC", x: 0, y: 330, width: 200, height: 40 },
    ],
  });
  const size = (d: Diagram, id: string) => {
    const zone = d.zones.find((z) => z.id === id)!;
    return [zone.width, zone.height];
  };
  const place = (d: Diagram, id: string) => {
    const zone = d.zones.find((z) => z.id === id)!;
    return [zone.x, zone.y];
  };

  it("grows every zone around one made bigger, keeping 20px, and never shrinks them again", () => {
    const grown = autoFit(resizeZone(nested(), "snet", 500, 400));
    expect(size(grown, "vnet")).toEqual([20 + 500 + 20, 40 + 400 + 20]);
    expect(size(grown, "sea")).toEqual([20 + 540 + 20, 40 + 460 + 20]);
    // MY01 also holds East Asia, moved to the right of the grown Southeast Asia.
    expect(size(grown, "my01")).toEqual([
      20 + 580 + 30 + 300 + 20,
      40 + 520 + 20,
    ]);
    const shrunk = autoFit(resizeZone(grown, "snet", 120, 40));
    expect(size(shrunk, "vnet")).toEqual(size(grown, "vnet"));
    expect(size(shrunk, "my01")).toEqual(size(grown, "my01"));
  });

  it("moves the neighbours of a zone that grows: East Asia to the right, PDC down", () => {
    const grown = autoFit(resizeZone(nested(), "snet", 500, 400));
    expect(place(grown, "ea")).toEqual([20 + 580 + 30, 40]);
    expect(place(grown, "pdc")).toEqual([0, 40 + 520 + 20 + 30]);
  });

  it("keeps a zone at least as big as what it holds plus 20px, and leaves an empty one its size", () => {
    expect(size(autoFit(resizeZone(nested(), "vnet", 50, 50)), "vnet")).toEqual(
      [20 + 100 + 20, 40 + 50 + 20],
    );
    expect(size(autoFit(nested()), "snet")).toEqual([100, 50]);
  });

  it("grows a zone to fit a box added past its edge", () => {
    let d = nested();
    for (const label of ["a", "b"])
      d = autoFit(addBox(d, { label, type: "server", parentId: "snet" }));
    expect(size(d, "snet")).toEqual([
      20 + BOX_WIDTH + 30 + BOX_WIDTH + 20,
      40 + BOX_HEIGHT + 20,
    ]);
  });
});

describe("dropping a dragged item", () => {
  const twoBoxes = () => {
    let d = addZone(base(), { label: "vnet" });
    d = addBox(d, { label: "a", type: "web", parentId: "zone-1" });
    return addBox(d, { label: "b", type: "web", parentId: "zone-1" });
  };

  it("leaves an item dropped clear of everything where it is", () => {
    const d = moveItem(twoBoxes(), "box-2", 400, 40);
    expect(snapToFree(d, "box-2")).toBe(d);
  });

  it("moves an item dropped on or near another to the nearest spot 30px clear of them all", () => {
    const d = snapToFree(moveItem(twoBoxes(), "box-2", 100, 50), "box-2");
    expect(d.boxes[1]).toMatchObject({ x: 100, y: 40 + BOX_HEIGHT + 30 });
  });

  it("keeps an item inside its zone from going past the top or left, but not one at the top level", () => {
    let d = addBox(addBox(base(), { label: "a", type: "web" }), {
      label: "b",
      type: "web",
    });
    d = snapToFree(moveItem(d, "box-2", 10, 10), "box-2");
    expect(d.boxes[1]).toMatchObject({ x: 10, y: BOX_HEIGHT + 30 });
    const up = snapToFree(
      moveItem(moveItem(d, "box-1", 10, 200), "box-2", 10, 150),
      "box-2",
    );
    expect(up.boxes[1]).toMatchObject({ x: 10, y: 200 - BOX_HEIGHT - 30 });
    const inside = snapToFree(
      moveItem(moveItem(twoBoxes(), "box-1", 20, 100), "box-2", 20, 60),
      "box-2",
    );
    expect(inside.boxes[1]).toMatchObject({ x: 20, y: 100 + BOX_HEIGHT + 30 });
  });
});

describe("diagrams in a slot", () => {
  it("adds, renames and removes titled diagrams, keeping at least one", () => {
    const content = { diagrams: [emptyDiagram("ci-cd-1", "CI and CD flow")] };
    const added = addDiagram(content, "CD flow");
    expect(added.diagrams.map((d) => [d.id, d.title, d.sizing])).toEqual([
      ["ci-cd-1", "CI and CD flow", "auto"],
      ["diagram-1", "CD flow", "auto"],
    ]);
    expect(
      updateDiagram(added, "diagram-1", { title: "CD" }).diagrams[1].title,
    ).toBe("CD");
    expect(removeDiagram(added, "ci-cd-1").diagrams.map((d) => d.id)).toEqual([
      "diagram-1",
    ]);
    expect(removeDiagram(content, "ci-cd-1")).toBe(content);
  });

  it("never gives a new diagram the id of one removed while its files are still kept (until the slot is saved)", () => {
    const content = { diagrams: [emptyDiagram("ci-cd-1", "CI and CD flow")] };
    expect(
      addDiagram(content, "CD flow", ["diagram-1", "diagram-3"]).diagrams[1].id,
    ).toBe("diagram-4");
  });
});

describe("answered", () => {
  const box = { id: "b", label: "B", type: "web", x: 0, y: 0 };
  it.each<[string, DiagramContent, boolean]>([
    [
      "Not applicable with a reason",
      { notApplicable: true, reason: "SaaS" },
      true,
    ],
    ["Not applicable without one", { notApplicable: true, reason: " " }, false],
    ["every diagram has a box", { diagrams: [base({ boxes: [box] })] }, true],
    [
      "one diagram is empty",
      { diagrams: [base({ boxes: [box] }), base({ id: "d2" })] },
      false,
    ],
  ])("%s", (_, content, expected) => {
    expect(answered(content)).toBe(expected);
  });
});

describe("empty content", () => {
  it.each([
    ["solution", [["solution", "Solution diagram", undefined]]],
    [
      "infrastructure",
      [
        ["production", "Production", "production"],
        ["non-production", "Non-production", "non-production"],
      ],
    ],
    ["ci-cd", [["ci-cd-1", "CI and CD flow", undefined]]],
    ["monitoring", [["monitoring-1", "Monitoring", undefined]]],
  ] as const)("starts the %s slot like the API does", (slot, expected) => {
    expect(
      emptyContent(slot).diagrams.map((d) => [d.id, d.title, d.tab]),
    ).toEqual(expected);
  });
});

describe("solution diagram", () => {
  const BILLING = {
    id: "ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1",
    number: "APM-Billing",
  };
  const drawn = () => {
    let d = addBox(base(), {
      label: " Billing ",
      type: "business",
      application: BILLING,
    });
    d = addBox(d, { label: "Customer", type: "actor" });
    return addLine(d, {
      from: "box-2",
      to: "box-1",
      calls: " Billing API ",
      does: "  ",
      twoWay: true,
    });
  };

  it("starts with a grouping box named after the application, like the API", () => {
    expect(emptyContent("solution", "CRM").diagrams[0].zones).toEqual([
      {
        id: "zone-1",
        label: "CRM",
        kind: "This application",
        x: 0,
        y: 0,
        width: Math.round(3 * 8.5 + 16 * 7 + 170),
        height: EMPTY_ZONE_HEIGHT,
      },
    ]);
    expect(emptyContent("solution", null).diagrams[0].zones).toEqual([]);
  });

  it("adds blocks typed or picked from TRM, and connections saying what they call and do", () => {
    const d = drawn();
    expect(d.boxes[0]).toEqual({
      id: "box-1",
      label: "Billing",
      type: "business",
      application: BILLING,
      x: 0,
      y: 0,
    });
    expect(d.boxes[1]).not.toHaveProperty("application");
    expect(d.lines).toEqual([
      {
        id: "line-1",
        from: "box-2",
        to: "box-1",
        calls: "Billing API",
        twoWay: true,
      },
    ]);
  });

  it("changes connection facts as typed, leaving out blank ones", () => {
    let d = updateLine(drawn(), "line-1", {
      does: "Bills the customer ",
      data: "Invoice: amount",
      classification: "confidential",
      frequency: "Daily",
    });
    expect(d.lines[0]).toEqual({
      id: "line-1",
      from: "box-2",
      to: "box-1",
      calls: "Billing API",
      twoWay: true,
      does: "Bills the customer ",
      data: "Invoice: amount",
      classification: "confidential",
      frequency: "Daily",
    });
    d = updateLine(d, "line-1", {
      data: " ",
      classification: undefined,
      frequency: "",
      twoWay: false,
    });
    expect(d.lines[0]).toEqual({
      id: "line-1",
      from: "box-2",
      to: "box-1",
      calls: "Billing API",
      does: "Bills the customer ",
    });
  });

  it("drops the TRM link when a block stops being a business application, and replaces it when picked again", () => {
    expect(
      updateBox(drawn(), "box-1", { type: "part" }).boxes[0],
    ).not.toHaveProperty("application");
    const typed = updateBox(drawn(), "box-1", {
      application: undefined,
      label: "Old billing",
    }).boxes[0];
    expect(typed).toMatchObject({ label: "Old billing", type: "business" });
    expect(typed).not.toHaveProperty("application");
    const repicked = {
      id: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d",
      number: "APM-HR",
    };
    expect(
      updateBox(drawn(), "box-1", { application: repicked, label: "HR Portal" })
        .boxes[0],
    ).toMatchObject({ label: "HR Portal", application: repicked });
  });

  it("lists what a connection still needs before submit, in each view", () => {
    const [line] = drawn().lines;
    expect(missingFacts("solution", line)).toEqual(["does"]);
    expect(missingFacts("solution", { ...line, does: "Bills" })).toEqual([]);
    expect(missingFacts("data-flow", line)).toEqual([]);
    expect(
      missingFacts("data-flow", { ...line, data: "Invoice", frequency: " " }),
    ).toEqual(["classification", "frequency"]);
    expect(missingFacts("monitoring", line)).toEqual([]);
  });

  it("lays new blocks out in columns: actors left of everything, other applications and external parties right of it", () => {
    let d = emptyContent("solution", "CRM").diagrams[0];
    d = autoFit(
      addBlock(d, { label: "Core", type: "part", parentId: "zone-1" }),
    );
    for (const [label, type] of [
      ["Billing", "business"],
      ["Customer", "actor"],
      ["Bank", "external"],
      ["Agent", "actor"],
    ]) {
      d = addBlock(d, { label, type });
    }
    const at = (label: string) => d.boxes.find((box) => box.label === label)!;
    const [crm] = d.zones;
    expect(at("Core")).toMatchObject({ parentId: "zone-1", x: 20, y: 40 });
    expect(at("Billing")).toMatchObject({
      x: crm.x + crm.width + 120,
      y: crm.y,
    });
    expect(at("Bank")).toMatchObject({
      x: at("Billing").x,
      y: at("Billing").y + BOX_HEIGHT + 30,
    });
    expect(at("Customer")).toMatchObject({
      x: crm.x - BOX_WIDTH - 120,
      y: crm.y,
    });
    expect(at("Agent")).toMatchObject({
      x: at("Customer").x,
      y: at("Customer").y + BOX_HEIGHT + 30,
    });
    // The first thing on an empty diagram sits at the start; a part without a grouping box goes below everything.
    expect(
      addBlock(base(), { label: "Customer", type: "actor" }).boxes[0],
    ).toMatchObject({ x: 0, y: 0 });
    expect(
      addBlock(d, { label: "Batch", type: "part" }).boxes.at(-1),
    ).toMatchObject({ x: 0, y: at("Bank").y + BOX_HEIGHT + 30 });
  });

  it("puts the right-hand column beside blocks outside any grouping box too", () => {
    const d = addBlock(addBlock(base(), { label: "Batch", type: "part" }), {
      label: "Bank",
      type: "external",
    });
    expect(d.boxes[1]).toMatchObject({ x: BOX_WIDTH + 120, y: 0 });
  });

  it("drops a TRM server link when the box stops being a server", () => {
    const d = addBox(base(), {
      label: "SRV-CRM-01",
      type: "server",
      server: { id: "5a27be1d-59d9-47d2-8070-6f33504dd0fb" },
    });
    expect(d.boxes[0].server).toEqual({
      id: "5a27be1d-59d9-47d2-8070-6f33504dd0fb",
    });
    expect(updateBox(d, "box-1", { type: "web" }).boxes[0]).not.toHaveProperty(
      "server",
    );
  });

  it("tells whether removing something also removes data flow facts (section 9)", () => {
    const d = updateLine(drawn(), "line-1", { classification: "internal" });
    expect(dataFactsLost(d, "box-1")).toBe(true);
    expect(dataFactsLost(d, "line-1")).toBe(true);
    expect(dataFactsLost(drawn(), "box-1")).toBe(false);
    expect(
      dataFactsLost(addBox(d, { label: "Bank", type: "external" }), "box-3"),
    ).toBe(false);
  });
});
