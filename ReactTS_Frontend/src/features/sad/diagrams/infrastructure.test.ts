import { describe, expect, it } from "vitest";
import type { Diagram, Hosting } from "../schemas";
import { regionName } from "../azure-regions";
import {
  applyHosting,
  boxPlaces,
  canAddZone,
  copyFromProduction,
  DEFAULT_HOSTING,
  keepOwnName,
  backToSetting,
  strandedIfRemoved,
  zonePlaces,
} from "./infrastructure";
import {
  addBox,
  addConnection,
  addLine,
  addZone,
  emptyContent,
  integrationLost,
  missingFacts,
  nonCompliantTls,
  removeItem,
  updateLine,
} from "./model";

type Drawn = { hosting: Hosting; diagrams: Diagram[] };
const fresh = (hosting: Hosting = DEFAULT_HOSTING) =>
  emptyContent("infrastructure", "CRM", hosting) as Drawn;
const SERVER = "5a27be1d-59d9-47d2-8070-6f33504dd0fb";
const POLICY = {
  id: "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
  number: "APM-0002",
};

describe("a new infrastructure diagram", () => {
  it("starts like the API: the hosting settings, and on both tabs the subscription with both regions, PDC, SDC and the office network", () => {
    const content = fresh();
    expect(content.hosting).toEqual(DEFAULT_HOSTING);
    expect(content.hosting).not.toBe(DEFAULT_HOSTING);
    expect(content.diagrams.map((d) => [d.id, d.tab])).toEqual([
      ["production", "production"],
      ["non-production", "non-production"],
    ]);
    for (const diagram of content.diagrams) {
      expect(
        diagram.zones.map((z) => [
          z.id,
          z.label,
          z.kind,
          z.hosting,
          z.parentId ?? null,
        ]),
      ).toEqual([
        ["subscription", "MY01", "subscription", "subscription", null],
        [
          "primary-region",
          "Southeast Asia",
          "region",
          "primaryRegion",
          "subscription",
        ],
        ["dr-region", "East Asia", "region", "drRegion", "subscription"],
        ["primary-dc", "PDC", "data-centre", "primaryDc", null],
        ["dr-dc", "SDC", "data-centre", "drDc", null],
        ["office", "Office network", "office", "officeNetwork", null],
      ]);
    }
    const at = (id: string) =>
      content.diagrams[0].zones.find((z) => z.id === id)!;
    expect([at("primary-region").x, at("primary-region").y]).toEqual([20, 40]);
    expect(at("dr-region").x).toBe(
      at("primary-region").x + at("primary-region").width + 30,
    );
    expect(at("subscription").width).toBe(
      at("dr-region").x + at("dr-region").width + 20,
    );
    expect(at("subscription").height).toBe(
      at("primary-region").y + at("primary-region").height + 20,
    );
    expect(at("primary-dc").y).toBe(
      at("subscription").y + at("subscription").height + 30,
    );
    expect(at("office").x).toBe(at("dr-dc").x + at("dr-dc").width + 30);
    expect(emptyContent("infrastructure").hosting).toEqual(DEFAULT_HOSTING);
  });

  it("knows every Azure region by name, and shows an unknown one as it is", () => {
    expect(regionName("malaysiawest")).toBe("Malaysia West");
    expect(regionName("moon")).toBe("moon");
  });
});

describe("hosting names", () => {
  it("names the fixed zones from the settings, except a zone whose name was changed for one diagram", () => {
    const content = fresh();
    content.hosting = {
      ...content.hosting,
      subscription: "MY02",
      drRegion: "japaneast",
    };
    content.diagrams[1] = keepOwnName(
      content.diagrams[1],
      "primary-dc",
      "PDC Cyberjaya",
    );
    const named = applyHosting(content) as Drawn;
    expect(named.diagrams.map((d) => d.zones.map((z) => z.label))).toEqual([
      ["MY02", "Southeast Asia", "Japan East", "PDC", "SDC", "Office network"],
      [
        "MY02",
        "Southeast Asia",
        "Japan East",
        "PDC Cyberjaya",
        "SDC",
        "Office network",
      ],
    ]);
    expect(named.diagrams[1].zones[3].ownName).toBe(true);
    const back = applyHosting({
      ...named,
      diagrams: [
        named.diagrams[0],
        backToSetting(named.diagrams[1], "primary-dc"),
      ],
    }) as Drawn;
    expect(back.diagrams[1].zones[3]).toMatchObject({ label: "PDC" });
    expect(back.diagrams[1].zones[3]).not.toHaveProperty("ownName");
    const monitoring = { diagrams: [] };
    expect(applyHosting(monitoring)).toBe(monitoring);
    const notApplicable = { notApplicable: true as const, reason: "SaaS" };
    expect(applyHosting(notApplicable)).toBe(notApplicable);
  });
});

describe("where things may sit", () => {
  const drawn = () => {
    let d = fresh().diagrams[0];
    d = addZone(d, {
      label: "vnet-crm",
      kind: "vnet",
      parentId: "primary-region",
    });
    d = addZone(d, { label: "snet-app", kind: "subnet", parentId: "zone-1" });
    return addZone(d, { label: "Internet", kind: "internet" });
  };

  it("offers each kind of zone only the zones it may sit in", () => {
    const d = drawn();
    expect(zonePlaces(d, "vnet")).toEqual(["primary-region", "dr-region"]);
    expect(zonePlaces(d, "subnet")).toEqual(["zone-1"]);
    expect(zonePlaces(d, "internet")).toEqual([null]);
    expect(zonePlaces(d, "region")).toEqual(["subscription"]);
  });

  it("offers each kind of box only the zones it may sit in", () => {
    const d = drawn();
    expect(boxPlaces(d, "server")).toEqual([
      "zone-2",
      "zone-1",
      "primary-dc",
      "dr-dc",
      "office",
    ]);
    expect(boxPlaces(d, "person")).toEqual(["office", "zone-3"]);
    expect(boxPlaces(d, "vpn")).toEqual(["office", "zone-1"]);
    expect(boxPlaces(d, "database")).toEqual([
      "primary-region",
      "dr-region",
      "zone-2",
      "zone-1",
    ]);
    expect(boxPlaces(d, "external")).toEqual([]);
    expect(boxPlaces(d, "business")).toEqual([null]);
  });

  it("stops a VNet going while it holds what its region cannot", () => {
    // Without its subnet, only the box decides.
    const d = removeItem(drawn(), "zone-2");
    const holding = (type: string) =>
      addBox(d, {
        label: "item",
        type,
        parentId: "zone-1",
        ...(type === "azure" ? { icon: "application-gateways" } : {}),
      });
    expect(strandedIfRemoved(d, "zone-1")).toBe(false);
    expect(strandedIfRemoved(holding("server"), "zone-1")).toBe(true);
    expect(strandedIfRemoved(holding("firewall"), "zone-1")).toBe(true);
    expect(strandedIfRemoved(holding("azure"), "zone-1")).toBe(false);
  });

  it("adds Internet, Azure global services and 3rd party zones once each; VNets and subnets as often as needed", () => {
    const d = drawn();
    expect(canAddZone(d, "internet")).toBe(false);
    expect(canAddZone(d, "third-party")).toBe(true);
    expect(canAddZone(d, "vnet")).toBe(true);
    expect(canAddZone(d, "region")).toBe(false);
  });
});

describe("copy from production", () => {
  it("replaces non-production with a copy of production: TRM servers become typed text, TRM applications stay linked", () => {
    const content = fresh();
    let production = content.diagrams[0];
    production = addBox(production, {
      label: "SRV-CRM-01",
      type: "server",
      parentId: "primary-dc",
    });
    production = {
      ...production,
      boxes: [{ ...production.boxes[0], server: { id: SERVER } }],
    };
    production = addBox(production, {
      label: "Policy Admin",
      type: "business",
      application: POLICY,
    });
    production = addLine(production, {
      from: "box-1",
      to: "box-2",
      label: "Batch file",
      dashed: true,
    });
    production = {
      ...keepOwnName(production, "office", "Menara AIA"),
      sizing: "manual",
    };
    const copied = copyFromProduction({
      ...content,
      diagrams: [production, content.diagrams[1]],
    }) as Drawn;
    const [, nonProduction] = copied.diagrams;
    expect(nonProduction).toMatchObject({
      id: "non-production",
      title: "Non-production",
      tab: "non-production",
      sizing: "manual",
    });
    expect(nonProduction.boxes[0]).toEqual({
      ...production.boxes[0],
      server: undefined,
    });
    expect(nonProduction.boxes[0]).not.toHaveProperty("server");
    expect(nonProduction.boxes[1]).toEqual(production.boxes[1]);
    expect(nonProduction.lines).toEqual(production.lines);
    expect(nonProduction.zones.find((z) => z.id === "office")).toMatchObject({
      label: "Menara AIA",
      ownName: true,
    });
    expect(copied.diagrams[0]).toBe(production);
    // The API is asked to copy production's integration connections too (the editor may not see them).
    expect(copied).toMatchObject({ copiedFromProduction: true });
  });
});

describe("integration connections", () => {
  const API = "0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f";
  const drawn = () => {
    let d = fresh().diagrams[0];
    d = addBox(d, { label: "CRM app", type: "server", parentId: "primary-dc" });
    d = addBox(d, {
      label: "Policy Admin",
      type: "business",
      application: POLICY,
    });
    d = addLine(d, {
      from: "primary-dc",
      to: "dr-dc",
      label: "Replication",
      dashed: true,
    });
    return addConnection(d, {
      from: "box-1",
      to: "box-2",
      protocol: " HTTPS ",
      port: 443,
      twoWay: true,
    });
  };

  it("adds a connection as an integration connection, beside the infrastructure lines", () => {
    expect(drawn().lines).toEqual([
      {
        id: "line-1",
        from: "primary-dc",
        to: "dr-dc",
        label: "Replication",
        dashed: true,
      },
      {
        id: "line-2",
        from: "box-1",
        to: "box-2",
        layer: "integration",
        protocol: "HTTPS",
        port: 443,
        twoWay: true,
      },
    ]);
  });

  it("lists what a connection still needs, like the API: the API link for the API pattern, what protects it without TLS", () => {
    const [line, connection] = drawn().lines;
    expect(missingFacts("integration", line)).toEqual([]);
    expect(missingFacts("integration", connection)).toEqual([
      "tls",
      "pattern",
      "authentication",
      "classification",
      "purpose",
      "flow",
    ]);
    const complete = {
      ...connection,
      tls: "1.2" as const,
      pattern: "database" as const,
      authentication: "Managed identity",
      classification: "confidential" as const,
      purpose: "Store",
      flow: "service" as const,
    };
    expect(missingFacts("integration", complete)).toEqual([]);
    expect(
      missingFacts("integration", { ...complete, pattern: "api" }),
    ).toEqual(["api"]);
    expect(
      missingFacts("integration", {
        ...complete,
        tls: "none",
        protection: " ",
      }),
    ).toEqual(["protection"]);
  });

  it("flags TLS 1.1 and 1.0 as not compliant", () => {
    const [line, connection] = drawn().lines;
    expect([
      nonCompliantTls({ ...connection, tls: "1.0" }),
      nonCompliantTls({ ...connection, tls: "1.1" }),
      nonCompliantTls({ ...connection, tls: "1.2" }),
      nonCompliantTls(line),
    ]).toEqual([true, true, false, false]);
  });

  it("drops the API link when the pattern is no longer API, what protects it once it has TLS, and cleared facts", () => {
    let d = updateLine(drawn(), "line-2", {
      pattern: "api",
      api: { id: API },
      tls: "none",
      protection: "SSH",
    });
    expect(d.lines[1]).toMatchObject({
      pattern: "api",
      api: { id: API },
      tls: "none",
      protection: "SSH",
    });
    d = updateLine(d, "line-2", {
      pattern: "file",
      tls: "1.3",
      port: undefined,
    });
    expect(d.lines[1]).toEqual({
      id: "line-2",
      from: "box-1",
      to: "box-2",
      layer: "integration",
      protocol: "HTTPS",
      twoWay: true,
      pattern: "file",
      tls: "1.3",
    });
    d = updateLine(d, "line-2", {
      pattern: undefined,
      tls: undefined,
      flow: undefined,
    });
    expect(d.lines[1]).not.toHaveProperty("pattern");
    expect(d.lines[1]).not.toHaveProperty("tls");
  });

  it("tells whether removing a box (or zone) also removes integration connections (section 2)", () => {
    expect(integrationLost(drawn(), "box-1")).toBe(true);
    expect(integrationLost(drawn(), "primary-dc")).toBe(false);
  });
});
