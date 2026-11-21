import { regionName } from "../azure-regions";
import type {
  Box,
  Diagram,
  DiagramContent,
  Hosting,
  HostingField,
  InfraZoneKind,
  Zone,
} from "../schemas";

/**
 * The infrastructure diagram's rules as the editor offers them (the API enforces the same): its fixed zones named
 * by the hosting settings, and where each kind of zone and box may sit (docs/modules/sad.md).
 */

/** Until the API's defaults are known (a slot that does not apply has no settings of its own). */
export const DEFAULT_HOSTING: Hosting = {
  subscription: "MY01",
  primaryRegion: "southeastasia",
  drRegion: "eastasia",
  primaryDc: "PDC",
  drDc: "SDC",
  officeNetwork: "Office network",
};

/** The zone each hosting setting names: always on the diagram, never added again. */
const HOSTED: Record<
  HostingField,
  { id: string; kind: InfraZoneKind; parent?: string }
> = {
  subscription: { id: "subscription", kind: "subscription" },
  primaryRegion: {
    id: "primary-region",
    kind: "region",
    parent: "subscription",
  },
  drRegion: { id: "dr-region", kind: "region", parent: "subscription" },
  primaryDc: { id: "primary-dc", kind: "data-centre" },
  drDc: { id: "dr-dc", kind: "data-centre" },
  officeNetwork: { id: "office", kind: "office" },
};

/** The kind of zone each kind sits in (null: on its own). */
const ZONE_PARENT: Record<InfraZoneKind, InfraZoneKind | null> = {
  subscription: null,
  region: "subscription",
  vnet: "region",
  subnet: "vnet",
  "data-centre": null,
  office: null,
  internet: null,
  "azure-global": null,
  "third-party": null,
};
const FIXED = new Set<string>([
  "subscription",
  "region",
  "data-centre",
  "office",
]);
const ONE_EACH = new Set<string>(["internet", "azure-global", "third-party"]);

type BoxGroup =
  | "server"
  | "person"
  | "device"
  | "service"
  | "external"
  | "business";
const DEVICES = new Set(["firewall", "wifi", "vpn"]);
const SERVICES = new Set([
  "azure",
  "web",
  "api",
  "worker",
  "database",
  "queue",
  "storage",
]);
const groupOf = (type: string): BoxGroup =>
  DEVICES.has(type)
    ? "device"
    : SERVICES.has(type)
      ? "service"
      : (type as BoxGroup);
/** The kinds of zone each kind of box sits in, in the order offered (null: outside the zones). */
const BOX_PLACES: Record<BoxGroup, (InfraZoneKind | null)[]> = {
  server: ["subnet", "vnet", "data-centre", "office"],
  person: ["office", "internet"],
  device: ["office", "vnet"],
  service: ["region", "subnet", "vnet", "azure-global"],
  external: ["third-party"],
  business: [null],
};

/** The zones (null: none) a kind of zone may sit in. */
export function zonePlaces(d: Diagram, kind: InfraZoneKind): (string | null)[] {
  const parent = ZONE_PARENT[kind];
  return parent === null
    ? [null]
    : d.zones.filter((zone) => zone.kind === parent).map((zone) => zone.id);
}

/** Azure services: the Azure service kind, and the generic shapes drawn before it. */
export const isService = (type: string) => SERVICES.has(type);

/** The zones (null: none) a kind of box may sit in. */
export function boxPlaces(d: Diagram, type: string): (string | null)[] {
  return BOX_PLACES[groupOf(type)].flatMap((kind) =>
    kind === null
      ? [null]
      : d.zones.filter((zone) => zone.kind === kind).map((zone) => zone.id),
  );
}

/**
 * What sits in a zone moves up to the zone's parent when it is removed: whether something there could not sit in
 * that parent (e.g. a subnet in a region), so it must be moved or removed first.
 */
export function strandedIfRemoved(d: Diagram, zoneId: string): boolean {
  const zone = d.zones.find((item) => item.id === zoneId)!;
  const parent = zone.parentId ?? null;
  return (
    d.zones.some(
      (child) =>
        child.parentId === zoneId &&
        !zonePlaces(d, child.kind as InfraZoneKind).includes(parent),
    ) ||
    d.boxes.some(
      (child) =>
        child.parentId === zoneId && !boxPlaces(d, child.type).includes(parent),
    )
  );
}

/** The fixed zones are always there; Internet, Azure global services and 3rd party at most once; VNets and subnets as often as needed. */
export function canAddZone(d: Diagram, kind: InfraZoneKind): boolean {
  if (FIXED.has(kind)) return false;
  return !ONE_EACH.has(kind) || !d.zones.some((zone) => zone.kind === kind);
}

/** The name each hosting setting gives its zone (regions by their Azure name). */
export function hostingNames(hosting: Hosting): Record<HostingField, string> {
  return {
    ...hosting,
    primaryRegion: regionName(hosting.primaryRegion),
    drRegion: regionName(hosting.drRegion),
  };
}

/** Names the fixed zones from the hosting settings, except those the author changed for one diagram. */
export function applyHosting(content: DiagramContent): DiagramContent {
  if (!("hosting" in content) || !content.hosting) return content;
  const names = hostingNames(content.hosting);
  return {
    ...content,
    diagrams: content.diagrams.map((d) => ({
      ...d,
      zones: d.zones.map((zone) =>
        zone.hosting && !zone.ownName
          ? { ...zone, label: names[zone.hosting] }
          : zone,
      ),
    })),
  };
}

/** Gives a fixed zone its own name on this diagram. */
export function keepOwnName(
  d: Diagram,
  zoneId: string,
  label: string,
): Diagram {
  return {
    ...d,
    zones: d.zones.map((zone) =>
      zone.id === zoneId ? { ...zone, label, ownName: true as const } : zone,
    ),
  };
}

/** Goes back to the hosting setting's name (applyHosting puts it in). */
export function backToSetting(d: Diagram, zoneId: string): Diagram {
  const back = (zone: Zone): Zone => {
    const next = { ...zone };
    delete next.ownName;
    return next;
  };
  return {
    ...d,
    zones: d.zones.map((zone) => (zone.id === zoneId ? back(zone) : zone)),
  };
}

/** Room a zone keeps right of and below what it holds, between neighbours, and where its contents start (under its name). */
const PAD = 20;
const GAP = 30;
const INSET = { x: 20, y: 40 };
/** An empty zone's automatic width: room for its name, kind and "Nothing drawn yet" (the API uses the same). */
export const emptyZoneWidth = (label: string, kind: string | undefined) =>
  Math.round(label.length * 8.5 + (kind?.length ?? 0) * 7 + 170);

/** The fixed zones, empty: the regions side by side in the subscription, the data centres and office network in a row below. */
export function fixedZones(hosting: Hosting): Zone[] {
  const names = hostingNames(hosting);
  const empty = (field: HostingField, x: number, y: number): Zone => {
    const { id, kind, parent } = HOSTED[field];
    return {
      id,
      label: names[field],
      kind,
      hosting: field,
      ...(parent ? { parentId: parent } : {}),
      x,
      y,
      width: emptyZoneWidth(names[field], kind),
      height: 40,
    };
  };
  const primary = empty("primaryRegion", INSET.x, INSET.y);
  const dr = empty("drRegion", primary.x + primary.width + GAP, INSET.y);
  const subscription = {
    ...empty("subscription", 0, 0),
    width: dr.x + dr.width + PAD,
    height: primary.y + primary.height + PAD,
  };
  const below = subscription.height + GAP;
  const pdc = empty("primaryDc", 0, below);
  const sdc = empty("drDc", pdc.width + GAP, below);
  const office = empty("officeNetwork", sdc.x + sdc.width + GAP, below);
  return [subscription, primary, dr, pdc, sdc, office];
}

/**
 * Non-production becomes a copy of production: zones (with names changed for that diagram), boxes, lines and the
 * zone-size choice. Servers linked to TRM become typed text (the author links the right ones); TRM applications stay.
 */
export function copyFromProduction(content: {
  diagrams: Diagram[];
  hosting?: Hosting;
}): DiagramContent & { copiedFromProduction: true } {
  const [production, nonProduction] = content.diagrams;
  const typed = (box: Box): Box => {
    const next = { ...box };
    delete next.server;
    return next;
  };
  const copy: Diagram = {
    ...production,
    id: nonProduction.id,
    title: nonProduction.title,
    tab: nonProduction.tab,
    boxes: production.boxes.map(typed),
  };
  // Marked so the save asks the API to copy production's integration connections too (the editor may not see them).
  return {
    ...content,
    diagrams: [production, copy],
    copiedFromProduction: true,
  };
}

/** What is wrong with hosting settings, per field (i18n keys): names must be filled, and each pair's primary and DR must differ. */
export function hostingProblems(
  hosting: Hosting,
): Partial<Record<HostingField, string>> {
  const problems: Partial<Record<HostingField, string>> = {};
  for (const field of [
    "subscription",
    "primaryDc",
    "drDc",
    "officeNetwork",
  ] as const)
    if (!hosting[field].trim())
      problems[field] = "sad.diagram.hostingNameNeeded";
  if (hosting.primaryRegion === hosting.drRegion)
    problems.drRegion = "sad.diagram.sameRegion";
  if (!problems.drDc && hosting.drDc.trim() === hosting.primaryDc.trim())
    problems.drDc = "sad.diagram.sameDc";
  return problems;
}
