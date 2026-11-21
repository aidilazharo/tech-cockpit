import { describe, expect, it } from "vitest";
import type { Diagram } from "../../schemas";
import { emptyContent, emptyDiagram } from "../model";
import {
  importDiagram,
  kindsFor,
  reviewOf,
  reviewProblems,
  type ReviewRow,
} from "./convert";
import type { DrawioArrow, DrawioItem, DrawioPage } from "./read";

const BILLING = {
  id: "ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1",
  number: "APM-0011",
  name: "Billing",
};
const item = (
  id: string,
  label: string,
  shape: DrawioItem["shape"],
  [x, y, width, height]: number[],
  extra: Partial<DrawioItem> = {},
): DrawioItem => ({
  id,
  label,
  container: shape === "swimlane" || shape === "group",
  x,
  y,
  width,
  height,
  shape,
  ...extra,
});
const arrow = (
  id: string,
  from: string,
  to: string,
  label = "",
  extra: Partial<DrawioArrow> = {},
): DrawioArrow => ({
  id,
  label,
  from,
  to,
  dashed: false,
  twoWay: false,
  ...extra,
});
const page = (
  items: DrawioItem[],
  arrows: DrawioArrow[] = [],
  name = "Page-1",
): DrawioPage => ({
  name,
  items,
  arrows,
  skipped: [{ label: "Draft only", reason: "text" }],
});
const choose = (rows: ReviewRow[], choices: Record<string, string | null>) =>
  rows.map((row) =>
    row.id in choices ? { ...row, becomes: choices[row.id] } : row,
  );
const summary = (rows: ReviewRow[]) =>
  rows.map((row) => [row.id, row.label, row.becomes]);

/** A solution drawing: CRM's box with its web app (an Azure icon), a customer, the bank and Billing, a few arrows. */
const SOLUTION = page(
  [
    item("crm", "CRM", "swimlane", [0, 0, 400, 300]),
    item("web", "Portal", "image", [40, 60, 176, 64], {
      parentId: "crm",
      icon: "app-services",
    }),
    item("fn", "", "image", [40, 160, 176, 64], {
      parentId: "crm",
      icon: "function-apps",
    }),
    item("customer", "Customer", "person", [-300, 60, 176, 64]),
    item("bank", "Bank", "rectangle", [600, 60, 176, 64]),
    item("billing", "Billing", "rectangle", [600, 200, 176, 64]),
    item("blank", "", "rectangle", [600, 400, 176, 64]),
    item("frame", "", "group", [900, 0, 300, 300]),
    item("logo", "Logo", "rectangle", [20, 20, 176, 64], { parentId: "frame" }),
  ],
  [
    arrow("a1", "customer", "web", "Agent portal"),
    arrow("a2", "web", "bank", "Payment API", { dashed: true, twoWay: true }),
    arrow("a3", "web", "billing", "Billing API"),
    arrow("a4", "web", "blank", "Nothing"),
    arrow("a5", "web", "frame"),
  ],
);

describe("the review of a draw.io page", () => {
  it("guesses solution blocks only where the shape says it, names an unnamed icon by its product, and leaves out what has no text", () => {
    const review = reviewOf("solution", SOLUTION);
    expect(summary(review.rows)).toEqual([
      ["crm", "CRM", "group"],
      ["web", "Portal", "part"],
      ["fn", "Function Apps", "part"],
      ["customer", "Customer", "actor"],
      ["bank", "Bank", null],
      ["billing", "Billing", null],
      ["logo", "Logo", null],
    ]);
    // A box without text keeps what it holds, one level up; a shape without text or icon is not imported.
    expect(review.notImported).toEqual([
      { label: "Draft only", reason: "text" },
      { label: "", reason: "no-text" },
      { label: "", reason: "no-text-box" },
    ]);
  });

  it("guesses CI and CD steps from their shapes: decisions, steps, and a start or end by where the arrows go", () => {
    const flow = page(
      [
        item("dev", "Developer", "swimlane", [0, 0, 1000, 150]),
        item("start", "Code change", "terminator", [40, 40, 176, 64], {
          parentId: "dev",
        }),
        item("build", "Build", "rectangle", [300, 40, 176, 64], {
          parentId: "dev",
        }),
        item("check", "Within policy?", "rhombus", [560, 40, 176, 64], {
          parentId: "dev",
        }),
        item("done", "Released", "terminator", [820, 40, 176, 64], {
          parentId: "dev",
        }),
        item("loop", "Retry", "terminator", [300, 200, 176, 64]),
        item("owner", "Owner", "person", [560, 200, 176, 64]),
      ],
      [
        arrow("a1", "start", "build"),
        arrow("a2", "build", "check"),
        arrow("a3", "check", "done", "Yes"),
        arrow("a4", "check", "loop", "No"),
        arrow("a5", "loop", "build"),
      ],
    );
    expect(summary(reviewOf("ci-cd", flow).rows)).toEqual([
      ["dev", "Developer", "lane"],
      ["start", "Code change", "start"],
      ["build", "Build", "step"],
      ["check", "Within policy?", "decision"],
      ["done", "Released", "end"],
      ["loop", "Retry", "step"],
      ["owner", "Owner", null],
    ]);
  });

  it("guesses monitoring blocks: Azure icons and the built-in services are monitoring services, people are teams", () => {
    const monitoring = page([
      item("azure", "Azure", "group", [0, 0, 400, 300]),
      item("ai", "App telemetry", "image", [20, 40, 176, 64], {
        parentId: "azure",
        icon: "application-insights",
      }),
      item("dt", "Dynatrace", "rectangle", [500, 40, 176, 64]),
      item("soc", "Security operations", "person", [800, 40, 176, 64]),
      item("itsm", "ServiceNow", "rectangle", [800, 200, 176, 64]),
    ]);
    expect(summary(reviewOf("monitoring", monitoring).rows)).toEqual([
      ["azure", "Azure", "group"],
      ["ai", "App telemetry", "monitoring"],
      ["dt", "Dynatrace", "monitoring"],
      ["soc", "Security operations", "team"],
      ["itsm", "ServiceNow", null],
    ]);
  });

  it("waits for a kind on every row, and a lane for every CI or CD step outside the swimlanes", () => {
    expect(
      reviewProblems(
        "solution",
        SOLUTION,
        reviewOf("solution", SOLUTION).rows,
        [],
      ),
    ).toEqual({ bank: "choose", billing: "choose", logo: "choose" });
    const chosen = choose(reviewOf("solution", SOLUTION).rows, {
      bank: "external",
      billing: "business",
      logo: "skip",
    });
    expect(reviewProblems("solution", SOLUTION, chosen, [])).toEqual({});

    const flow = page([
      item("dev", "Developer", "swimlane", [0, 0, 600, 150]),
      item("build", "Build", "rectangle", [40, 40, 176, 64], {
        parentId: "dev",
      }),
      item("loose", "Deploy", "rectangle", [40, 300, 176, 64]),
    ]);
    const rows = reviewOf("ci-cd", flow).rows;
    expect(reviewProblems("ci-cd", flow, rows, [])).toEqual({ loose: "lane" });
    expect(
      reviewProblems(
        "ci-cd",
        flow,
        rows.map((row) => (row.id === "loose" ? { ...row, lane: "dev" } : row)),
        [],
      ),
    ).toEqual({});
    // Skipping the swimlane leaves its steps without a lane.
    expect(
      reviewProblems("ci-cd", flow, choose(rows, { dev: "skip" }), []),
    ).toEqual({ build: "lane", loose: "lane" });
  });
});

describe("importing a reviewed page", () => {
  const chosen = () =>
    choose(reviewOf("solution", SOLUTION).rows, {
      bank: "external",
      billing: "business",
      logo: "skip",
    });

  it("makes the solution diagram: blocks where the shapes were, inside their grouping box, arrows saying what they call", () => {
    const { diagram, notImported } = importDiagram(
      "solution",
      SOLUTION,
      chosen(),
      {
        base: emptyDiagram("solution", "Solution diagram"),
        links: { billing: BILLING },
      },
    );
    expect(diagram).toMatchObject({
      id: "solution",
      title: "Solution diagram",
      sizing: "auto",
    });
    expect(
      diagram.zones.map((zone) => [zone.id, zone.label, zone.x, zone.y]),
    ).toEqual([["zone-1", "CRM", 0, 0]]);
    expect(diagram.boxes).toEqual([
      {
        id: "box-1",
        label: "Portal",
        type: "part",
        icon: "app-services",
        parentId: "zone-1",
        x: 40,
        y: 60,
      },
      {
        id: "box-2",
        label: "Function Apps",
        type: "part",
        icon: "function-apps",
        parentId: "zone-1",
        x: 40,
        y: 160,
      },
      { id: "box-3", label: "Customer", type: "actor", x: -300, y: 60 },
      { id: "box-4", label: "Bank", type: "external", x: 600, y: 60 },
      // Linked to TRM: named as TRM names it.
      {
        id: "box-5",
        label: "Billing",
        type: "business",
        application: { id: BILLING.id, number: "APM-0011" },
        x: 600,
        y: 200,
      },
    ]);
    // The grouping box fits what it holds (automatic sizes).
    expect(diagram.zones[0]).toMatchObject({
      width: 40 + 176 + 20,
      height: 160 + 64 + 20,
    });
    expect(diagram.lines).toEqual([
      { id: "line-1", from: "box-3", to: "box-1", calls: "Agent portal" },
      {
        id: "line-2",
        from: "box-1",
        to: "box-4",
        calls: "Payment API",
        dashed: true,
        twoWay: true,
      },
      { id: "line-3", from: "box-1", to: "box-5", calls: "Billing API" },
    ]);
    expect(notImported).toEqual([
      { label: "Draft only", reason: "text" },
      { label: "", reason: "no-text" },
      { label: "", reason: "no-text-box" },
      { label: "Logo", reason: "skipped" },
      // Arrows to what is not imported.
      { label: "Nothing", from: "Portal", to: "", reason: "end-not-imported" },
      { label: "", from: "Portal", to: "", reason: "end-not-imported" },
    ]);
  });

  it("keeps an unlinked business application typed", () => {
    const { diagram } = importDiagram("solution", SOLUTION, chosen(), {
      base: emptyDiagram("solution", "Solution diagram"),
      links: {},
    });
    expect(diagram.boxes[4]).toEqual({
      id: "box-5",
      label: "Billing",
      type: "business",
      x: 600,
      y: 200,
    });
  });

  it("spaces shapes out in proportion when draw.io's are smaller than our boxes", () => {
    const small = page([
      item("a", "A", "rectangle", [0, 0, 88, 32]),
      item("b", "B", "rectangle", [200, 0, 88, 32]),
    ]);
    const { diagram } = importDiagram(
      "solution",
      small,
      choose(reviewOf("solution", small).rows, { a: "part", b: "external" }),
      { base: emptyDiagram("solution", "S"), links: {} },
    );
    expect(diagram.boxes.map((box) => [box.x, box.y])).toEqual([
      [0, 0],
      [400, 0],
    ]);
  });

  it("makes a CI or CD flow named after its page: lanes stacked, steps in their lanes, arrows between steps only", () => {
    const flow = page(
      [
        item("ado", "Azure DevOps", "swimlane", [0, 200, 1000, 150]),
        item("dev", "Developer", "swimlane", [0, 0, 1000, 150]),
        item("start", "Code change", "terminator", [40, 40, 176, 64], {
          parentId: "dev",
        }),
        item("build", "Build", "rectangle", [40, 40, 176, 64], {
          parentId: "ado",
        }),
        item("loose", "Deploy", "rectangle", [400, 500, 176, 64]),
        item("cab", "Release approved?", "rectangle", [700, 500, 176, 64]),
      ],
      [
        arrow("a1", "start", "build"),
        arrow("a2", "build", "loose", "Built"),
        arrow("a3", "start", "ado"),
      ],
      "CI flow",
    );
    const rows = reviewOf("ci-cd", flow).rows.map((row) =>
      row.id === "loose"
        ? { ...row, lane: "new-1" }
        : row.id === "cab"
          ? { ...row, becomes: "approval", lane: "ado" }
          : row,
    );
    const { diagram, notImported } = importDiagram("ci-cd", flow, rows, {
      base: emptyDiagram("ci-cd-1", "CI and CD flow"),
      links: {},
      lanes: ["Release"],
    });
    expect(diagram.title).toBe("CI flow");
    expect(
      diagram.zones.map((lane) => [lane.id, lane.label, lane.kind, lane.y]),
    ).toEqual([
      ["zone-1", "Developer", "lane", 0],
      ["zone-2", "Azure DevOps", "lane", 140],
      ["zone-3", "Release", "lane", 280],
    ]);
    expect(
      diagram.boxes.map((box) => [box.label, box.type, box.parentId]),
    ).toEqual([
      ["Code change", "start", "zone-1"],
      ["Build", "step", "zone-2"],
      ["Deploy", "step", "zone-3"],
      ["Release approved?", "approval", "zone-2"],
    ]);
    // A step moved into a lane it was not drawn in goes after that lane's steps.
    expect(diagram.boxes[3]).toMatchObject({ x: 276, y: 40 });
    expect(diagram.lines).toEqual([
      { id: "line-1", from: "box-1", to: "box-2" },
      { id: "line-2", from: "box-2", to: "box-3", label: "Built" },
    ]);
    expect(notImported.at(-1)).toEqual({
      label: "",
      from: "Code change",
      to: "Azure DevOps",
      reason: "lane-arrow",
    });
  });

  it("makes a monitoring diagram: a built-in Azure service takes its icon, an other system its TRM link", () => {
    const monitoring = page(
      [
        item("ai", "Application Insights", "rectangle", [0, 0, 176, 64]),
        item("itsm", "ServiceNow", "rectangle", [300, 0, 176, 64]),
      ],
      [arrow("a1", "ai", "itsm", "Alert")],
      "Alerts",
    );
    const rows = choose(reviewOf("monitoring", monitoring).rows, {
      ai: "monitoring",
      itsm: "system",
    });
    const { diagram } = importDiagram("monitoring", monitoring, rows, {
      base: emptyDiagram("monitoring-1", "Monitoring"),
      links: { itsm: { ...BILLING, name: "ServiceNow" } },
    });
    expect(diagram).toMatchObject({ title: "Alerts" });
    expect(diagram.boxes).toEqual([
      {
        id: "box-1",
        label: "Application Insights",
        type: "monitoring",
        icon: "application-insights",
        x: 0,
        y: 0,
      },
      {
        id: "box-2",
        label: "ServiceNow",
        type: "system",
        application: { id: BILLING.id, number: "APM-0011" },
        x: 300,
        y: 0,
      },
    ]);
    expect(diagram.lines).toEqual([
      { id: "line-1", from: "box-1", to: "box-2", label: "Alert" },
    ]);
  });

  it("nests grouping boxes as drawn, and names an arrow end that is free text by nothing", () => {
    const nested = page(
      [
        item("outer", "Azure", "group", [0, 0, 600, 400]),
        item("inner", "Monitor", "group", [20, 40, 300, 200], {
          parentId: "outer",
        }),
        item("ai", "Insights", "image", [20, 40, 176, 64], {
          parentId: "inner",
          icon: "application-insights",
        }),
      ],
      [arrow("a1", "ai", "note-cell", "Logs")],
    );
    const { diagram, notImported } = importDiagram(
      "monitoring",
      nested,
      reviewOf("monitoring", nested).rows,
      { base: emptyDiagram("monitoring-1", "Monitoring"), links: {} },
    );
    expect(
      diagram.zones.map((zone) => [
        zone.id,
        zone.parentId ?? null,
        zone.x,
        zone.y,
      ]),
    ).toEqual([
      ["zone-1", null, 0, 0],
      ["zone-2", "zone-1", 20, 40],
    ]);
    expect(diagram.boxes[0]).toMatchObject({
      parentId: "zone-2",
      x: 20,
      y: 40,
    });
    expect(notImported.at(-1)).toEqual({
      label: "Logs",
      from: "Insights",
      to: "",
      reason: "end-not-imported",
    });
  });

  it("imports a page of lanes without steps", () => {
    const lanesOnly = page(
      [item("dev", "Developer", "swimlane", [0, 0, 600, 150])],
      [],
      "Lanes",
    );
    const { diagram } = importDiagram(
      "ci-cd",
      lanesOnly,
      reviewOf("ci-cd", lanesOnly).rows,
      { base: emptyDiagram("ci-cd-1", "CI and CD flow"), links: {} },
    );
    expect(diagram.zones.map((lane) => lane.label)).toEqual(["Developer"]);
    expect(diagram.boxes).toEqual([]);
  });

  it("links to TRM only blocks that can be linked", () => {
    const rows = choose(reviewOf("solution", SOLUTION).rows, {
      bank: "external",
      billing: "business",
      logo: "skip",
    });
    const { diagram } = importDiagram("solution", SOLUTION, rows, {
      base: emptyDiagram("solution", "S"),
      links: { bank: BILLING },
    });
    expect((diagram as Diagram).boxes[3]).not.toHaveProperty("application");
  });
});

describe("numbering what is imported", () => {
  it("goes on after what was on the diagram, so nothing kept for its old items (e.g. data flow facts) attaches to new ones", () => {
    const base: Diagram = {
      ...emptyDiagram("solution", "Solution diagram"),
      zones: [
        {
          id: "zone-1",
          label: "CRM",
          kind: "This application",
          x: 0,
          y: 0,
          width: 300,
          height: 100,
        },
      ],
      boxes: [{ id: "box-3", label: "Old", type: "part", x: 0, y: 0 }],
      lines: [{ id: "line-2", from: "box-3", to: "zone-1" }],
    };
    const rows = choose(reviewOf("solution", SOLUTION).rows, {
      bank: "external",
      billing: "business",
      logo: "skip",
    });
    const { diagram } = importDiagram("solution", SOLUTION, rows, {
      base,
      links: {},
    });
    expect([
      diagram.zones.map((zone) => zone.id),
      diagram.boxes.map((box) => box.id),
      diagram.lines.map((line) => line.id),
    ]).toEqual([
      ["zone-2"],
      ["box-4", "box-5", "box-6", "box-7", "box-8"],
      ["line-3", "line-4", "line-5"],
    ]);
    expect(diagram.boxes[0].parentId).toBe("zone-2");
  });

  it("goes on after the ids of lines the editor cannot see too", () => {
    const base: Diagram = {
      ...emptyDiagram("solution", "Solution diagram"),
      taken: ["line-7", "box-9"],
    };
    const rows = choose(reviewOf("solution", SOLUTION).rows, {
      bank: "external",
      billing: "business",
      logo: "skip",
    });
    const { diagram } = importDiagram("solution", SOLUTION, rows, {
      base,
      links: {},
    });
    expect([diagram.boxes[0].id, diagram.lines[0].id]).toEqual([
      "box-10",
      "line-8",
    ]);
  });
});

describe("importing into the infrastructure diagram", () => {
  /** MY01 with Southeast Asia, a VNet and subnet holding a VM and an App Service; PDC with a database server; two Internet zones. */
  const INFRA = page(
    [
      item("sub", "MY01 subscription", "group", [0, 0, 1200, 800]),
      item("sea", "Southeast Asia", "group", [20, 40, 800, 600], {
        parentId: "sub",
      }),
      item("vnet", "vnet-crm", "group", [20, 40, 700, 400], {
        parentId: "sea",
      }),
      item("snet", "snet-app", "group", [20, 40, 600, 200], {
        parentId: "vnet",
      }),
      item("vm", "CRM VM", "rectangle", [20, 40, 176, 64], {
        parentId: "snet",
      }),
      item("app", "Portal", "image", [250, 40, 176, 64], {
        parentId: "snet",
        icon: "app-services",
      }),
      item("pdc", "PDC", "group", [0, 900, 400, 200]),
      item("db", "DB server", "rectangle", [20, 40, 176, 64], {
        parentId: "pdc",
      }),
      item("net", "Internet", "group", [1300, 0, 300, 200]),
      item("user", "Customer", "person", [20, 40, 176, 64], {
        parentId: "net",
      }),
      item("net2", "Public web", "group", [1300, 300, 300, 200]),
    ],
    [
      arrow("i1", "user", "app", "HTTPS"),
      arrow("i2", "app", "db", "SQL"),
      arrow("i3", "vm", "db"),
    ],
    "Production",
  );
  const production = () => {
    const tab = emptyContent("infrastructure").diagrams[0];
    return {
      ...tab,
      boxes: [
        {
          id: "box-1",
          label: "Old VM",
          type: "server",
          parentId: "primary-dc",
          x: 20,
          y: 40,
        },
      ],
      lines: [{ id: "line-1", from: "box-1", to: "primary-dc" }],
    };
  };
  const mapped = (extra: Record<string, string | null> = {}) =>
    choose(reviewOf("infrastructure", INFRA).rows, {
      sub: "into:subscription",
      sea: "into:primary-region",
      vnet: "vnet",
      snet: "subnet",
      vm: "server",
      pdc: "into:primary-dc",
      db: "server",
      net: "internet",
      net2: "skip",
      ...extra,
    });

  it("guesses only Azure services and people; containers are mapped to a zone kind or merged into a fixed zone", () => {
    expect(
      summary(reviewOf("infrastructure", INFRA).rows).map(([id, , becomes]) => [
        id,
        becomes,
      ]),
    ).toEqual([
      ["sub", null],
      ["sea", null],
      ["vnet", null],
      ["snet", null],
      ["vm", null],
      ["app", "azure"],
      ["pdc", null],
      ["db", null],
      ["net", null],
      ["user", "person"],
      ["net2", null],
    ]);
    const rows = reviewOf("infrastructure", INFRA).rows;
    expect(kindsFor("infrastructure", rows[0])).toEqual([
      "vnet",
      "subnet",
      "internet",
      "azure-global",
      "third-party",
      "into:subscription",
      "into:primary-region",
      "into:dr-region",
      "into:primary-dc",
      "into:dr-dc",
      "into:office",
    ]);
    // An Azure service is offered only for a shape with an Azure icon.
    expect(kindsFor("infrastructure", rows[4])).toEqual([
      "server",
      "person",
      "firewall",
      "wifi",
      "vpn",
      "external",
      "business",
    ]);
    expect(kindsFor("infrastructure", rows[5])).toContain("azure");
  });

  it("checks where each zone and box may sit, and that Internet, Azure global services and 3rd party are there once", () => {
    expect(
      reviewProblems("infrastructure", INFRA, mapped(), [], production()),
    ).toEqual({});
    expect(
      reviewProblems(
        "infrastructure",
        INFRA,
        mapped({ net2: "internet" }),
        [],
        production(),
      ),
    ).toEqual({ net2: "one-each" });
    // Southeast Asia skipped: the VNet would sit in the subscription, not a region.
    expect(
      reviewProblems(
        "infrastructure",
        INFRA,
        mapped({ sea: "skip" }),
        [],
        production(),
      ),
    ).toEqual({ vnet: "place" });
    expect(
      reviewProblems(
        "infrastructure",
        INFRA,
        mapped({ db: "person", user: "firewall" }),
        [],
        production(),
      ),
    ).toEqual({ db: "place", user: "place" });
    // The subnet skipped: a server, network device or Azure service may sit straight in the VNet; a person may not.
    expect(
      reviewProblems(
        "infrastructure",
        INFRA,
        mapped({ snet: "skip" }),
        [],
        production(),
      ),
    ).toEqual({});
    expect(
      reviewProblems(
        "infrastructure",
        INFRA,
        mapped({ snet: "skip", vm: "firewall" }),
        [],
        production(),
      ),
    ).toEqual({});
    expect(
      reviewProblems(
        "infrastructure",
        INFRA,
        mapped({ snet: "skip", vm: "person" }),
        [],
        production(),
      ),
    ).toEqual({ vm: "place" });
  });

  it("replaces the tab but its fixed zones, merging containers into them and placing the rest inside", () => {
    const { diagram } = importDiagram("infrastructure", INFRA, mapped(), {
      base: production(),
      links: {},
    });
    expect(diagram).toMatchObject({
      id: "production",
      tab: "production",
      title: "Production",
    });
    const zone = (id: string) => diagram.zones.find((z) => z.id === id)!;
    expect(
      diagram.zones
        .filter((z) => !z.hosting)
        .map((z) => [z.id, z.label, z.kind, z.parentId ?? null]),
    ).toEqual([
      ["zone-1", "vnet-crm", "vnet", "primary-region"],
      ["zone-2", "snet-app", "subnet", "zone-1"],
      ["zone-3", "Internet", "internet", null],
    ]);
    expect(zone("subscription").hosting).toBe("subscription");
    expect(
      diagram.boxes.map((box) => [
        box.id,
        box.label,
        box.type,
        box.icon ?? null,
        box.parentId,
      ]),
    ).toEqual([
      ["box-2", "CRM VM", "server", null, "zone-2"],
      ["box-3", "Portal", "azure", "app-services", "zone-2"],
      ["box-4", "DB server", "server", null, "primary-dc"],
      ["box-5", "Customer", "person", null, "zone-3"],
    ]);
    expect(diagram.lines).toEqual([
      { id: "line-2", from: "box-5", to: "box-3", label: "HTTPS" },
      { id: "line-3", from: "box-3", to: "box-4", label: "SQL" },
      { id: "line-4", from: "box-2", to: "box-4" },
    ]);
  });
});
