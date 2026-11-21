import { z } from 'zod';
import {
  AZURE_REGIONS,
  regionName,
  type AzureRegion,
} from './azure-regions.js';
import type { Diagram, DiagramContent, Zone } from './diagrams.js';

/**
 * The infrastructure diagram (docs/modules/sad.md): Azure (subscription › region › VNet › subnet), the on-premises
 * data centres and office network, and the zones and boxes that may sit where. Its fixed zones are named by the
 * application's hosting settings, kept with the diagram.
 */

export const HOSTING_FIELDS = [
  'subscription',
  'primaryRegion',
  'drRegion',
  'primaryDc',
  'drDc',
  'officeNetwork',
] as const;
export type HostingField = (typeof HOSTING_FIELDS)[number];

const Name = z.string().trim().min(1).max(100);
const Region = z.enum(
  AZURE_REGIONS.map((region) => region.code) as [AzureRegion, ...AzureRegion[]],
);
/** The fields (for request schemas that add to them); HostingSchema adds the pair rules. */
export const HostingFields = z.object({
  subscription: Name,
  primaryRegion: Region,
  drRegion: Region,
  primaryDc: Name,
  drDc: Name,
  officeNetwork: Name,
});
/** A pair's primary and DR must differ. */
export function hostingRules(
  hosting: z.infer<typeof HostingFields>,
  ctx: z.RefinementCtx,
): void {
  if (hosting.primaryRegion === hosting.drRegion)
    ctx.addIssue({
      code: 'custom',
      path: ['drRegion'],
      message: 'The DR region must differ from the primary region',
    });
  if (hosting.primaryDc === hosting.drDc)
    ctx.addIssue({
      code: 'custom',
      path: ['drDc'],
      message: 'The DR data centre must differ from the primary one',
    });
}
export const HostingSchema = HostingFields.strict().superRefine(hostingRules);
export type Hosting = z.infer<typeof HostingSchema>;

/** Used until an administrator has saved the diagram defaults (the migration seeds the same values). */
export const DEFAULT_HOSTING: Hosting = {
  subscription: 'MY01',
  primaryRegion: 'southeastasia',
  drRegion: 'eastasia',
  primaryDc: 'PDC',
  drDc: 'SDC',
  officeNetwork: 'Office network',
};

/** Integration connections: TLS (1.1 and 1.0 are flagged non-compliant), pattern and flow type. */
export const TLS_VERSIONS = ['1.3', '1.2', '1.1', '1.0', 'none'] as const;
export const NON_COMPLIANT_TLS: readonly string[] = ['1.1', '1.0'];
export const PATTERNS = ['api', 'web-ui', 'file', 'event', 'database'] as const;
export const FLOW_TYPES = ['service', 'end-user', 'it-admin'] as const;
/** The facts only an integration connection has (its classification too). */
export const INTEGRATION_FACTS = [
  'protocol',
  'port',
  'tls',
  'protection',
  'pattern',
  'api',
  'authentication',
  'purpose',
  'flow',
  'classification',
] as const;

export const INFRA_ZONE_KINDS = [
  'subscription',
  'region',
  'vnet',
  'subnet',
  'data-centre',
  'office',
  'internet',
  'azure-global',
  'third-party',
] as const;
type ZoneKind = (typeof INFRA_ZONE_KINDS)[number];
/** "azure": an Azure service, named by its icon (2026-10-24); the generic service shapes before it stay valid. */
export const INFRA_BOX_TYPES = [
  'server',
  'person',
  'firewall',
  'wifi',
  'vpn',
  'azure',
  'web',
  'api',
  'worker',
  'database',
  'queue',
  'storage',
  'external',
  'business',
] as const;

/** The zone each hosting setting names: always on the diagram, never added again. */
export const HOSTED_ZONES: Record<
  HostingField,
  { id: string; kind: ZoneKind; parent?: string }
> = {
  subscription: { id: 'subscription', kind: 'subscription' },
  primaryRegion: {
    id: 'primary-region',
    kind: 'region',
    parent: 'subscription',
  },
  drRegion: { id: 'dr-region', kind: 'region', parent: 'subscription' },
  primaryDc: { id: 'primary-dc', kind: 'data-centre' },
  drDc: { id: 'dr-dc', kind: 'data-centre' },
  officeNetwork: { id: 'office', kind: 'office' },
};
const FIXED_KINDS = new Set<string>([
  'subscription',
  'region',
  'data-centre',
  'office',
]);
const ONE_EACH: ZoneKind[] = ['internet', 'azure-global', 'third-party'];

/** The kind of zone each kind sits in (null: on its own). */
const ZONE_PARENT: Record<ZoneKind, ZoneKind | null> = {
  subscription: null,
  region: 'subscription',
  vnet: 'region',
  subnet: 'vnet',
  'data-centre': null,
  office: null,
  internet: null,
  'azure-global': null,
  'third-party': null,
};
const ON_ITS_OWN = 'This zone sits on its own, not inside another';
const ZONE_MESSAGE: Record<ZoneKind, string> = {
  subscription: ON_ITS_OWN,
  region: 'A region sits inside the subscription',
  vnet: 'A VNet sits inside a region',
  subnet: 'A subnet sits inside a VNet',
  'data-centre': ON_ITS_OWN,
  office: ON_ITS_OWN,
  internet: ON_ITS_OWN,
  'azure-global': ON_ITS_OWN,
  'third-party': ON_ITS_OWN,
};

type BoxGroup =
  'server' | 'person' | 'device' | 'service' | 'external' | 'business';
const DEVICES = new Set(['firewall', 'wifi', 'vpn']);
const SERVICES = new Set([
  'azure',
  'web',
  'api',
  'worker',
  'database',
  'queue',
  'storage',
]);
const groupOf = (type: string): BoxGroup =>
  DEVICES.has(type)
    ? 'device'
    : SERVICES.has(type)
      ? 'service'
      : (type as BoxGroup);
/** The kinds of zone each kind of box sits in (null: outside the zones). */
const BOX_PLACES: Record<BoxGroup, (ZoneKind | null)[]> = {
  server: ['subnet', 'vnet', 'data-centre', 'office'],
  person: ['office', 'internet'],
  device: ['office', 'vnet'],
  service: ['region', 'subnet', 'vnet', 'azure-global'],
  external: ['third-party'],
  business: [null],
};
const PLACE_MESSAGE: Record<BoxGroup, string> = {
  server:
    'A server sits in a subnet, a VNet, a data centre or the office network',
  person: 'A person sits in the office network or the Internet zone',
  device: 'A network device sits in the office network or a VNet',
  service:
    'An Azure service sits in a region, a subnet, a VNet or Azure global services',
  external: 'An external party sits in the 3rd party zone',
  business: 'A business application sits outside the zones',
};

const isZoneKind = (kind: string | undefined): kind is ZoneKind =>
  (INFRA_ZONE_KINDS as readonly (string | undefined)[]).includes(kind);

/** Where zones and boxes may sit on each infrastructure diagram, and its fixed zones. */
export function infrastructureRules(
  diagrams: Diagram[],
  ctx: z.RefinementCtx,
): void {
  diagrams.forEach((diagram, d) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path: ['diagrams', d, ...path], message });
    const kinds = new Map(diagram.zones.map((zone) => [zone.id, zone.kind]));
    const kindOf = (id: string | undefined) =>
      id === undefined ? null : kinds.get(id);
    diagram.zones.forEach((zone, z) => {
      if (!isZoneKind(zone.kind))
        issue(
          ['zones', z, 'kind'],
          'Choose subscription, region, VNet, subnet, data centre, office network, Internet, Azure global services or 3rd party',
        );
      else if (kindOf(zone.parentId) !== ZONE_PARENT[zone.kind])
        issue(['zones', z, 'parentId'], ZONE_MESSAGE[zone.kind]);
      if (zone.ownName && !zone.hosting)
        issue(
          ['zones', z, 'ownName'],
          'Only a zone named by the hosting settings has its own name',
        );
    });
    const named = (field: HostingField) =>
      diagram.zones.filter(
        (zone) =>
          zone.hosting === field && zone.kind === HOSTED_ZONES[field].kind,
      ).length === 1;
    const unnamed = diagram.zones.some(
      (zone) =>
        FIXED_KINDS.has(zone.kind ?? '') !== (zone.hosting !== undefined),
    );
    if (
      unnamed ||
      !HOSTING_FIELDS.every(named) ||
      diagram.zones.filter((zone) => zone.hosting).length !==
        HOSTING_FIELDS.length
    ) {
      issue(
        ['zones'],
        'The infrastructure diagram keeps its subscription, primary and DR regions, PDC, SDC and office network',
      );
    }
    if (
      ONE_EACH.some(
        (kind) => diagram.zones.filter((zone) => zone.kind === kind).length > 1,
      )
    )
      issue(
        ['zones'],
        'At most one Internet, Azure global services and 3rd party zone',
      );
    const boxes = new Set(diagram.boxes.map((box) => box.id));
    diagram.lines.forEach((line, l) => {
      const integration = line.layer === 'integration';
      if (integration && !(boxes.has(line.from) && boxes.has(line.to)))
        issue(['lines', l], 'An integration connection joins two boxes');
      if (
        !integration &&
        INTEGRATION_FACTS.some((key) => line[key] !== undefined)
      )
        issue(['lines', l], 'Only an integration connection has this');
      if (line.api && line.pattern !== 'api')
        issue(
          ['lines', l, 'api'],
          'Only an API connection links to the API inventory',
        );
      if (line.protection !== undefined && line.tls !== 'none')
        issue(
          ['lines', l, 'protection'],
          'Only a connection without TLS says what protects it',
        );
    });
    diagram.boxes.forEach((box, b) => {
      if (!(INFRA_BOX_TYPES as readonly string[]).includes(box.type)) {
        issue(
          ['boxes', b, 'type'],
          'Choose server, person, network device, Azure service, external party or business application',
        );
        return;
      }
      const group = groupOf(box.type);
      if (!BOX_PLACES[group].includes(kindOf(box.parentId) as ZoneKind | null))
        issue(['boxes', b, 'parentId'], PLACE_MESSAGE[group]);
      if (box.type === 'azure' && !box.icon)
        issue(['boxes', b, 'icon'], 'Choose the Azure service');
      if (box.server && box.type !== 'server')
        issue(['boxes', b, 'server'], 'Only a server links to a TRM server');
      if (box.application && box.type !== 'business')
        issue(
          ['boxes', b, 'application'],
          'Only a business application block links to TRM',
        );
    });
  });
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
  if (!('hosting' in content) || !content.hosting) return content;
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

/** An infrastructure diagram drawn before the hosting settings existed gets these (the current defaults). */
export function withHosting(
  slot: string,
  content: DiagramContent,
  hosting: Hosting,
): DiagramContent {
  if (
    slot !== 'infrastructure' ||
    'notApplicable' in content ||
    content.hosting
  )
    return content;
  return { ...content, hosting };
}

/** Room a zone keeps right of and below what it holds, between neighbours, and where its contents start (as the editor lays them out). */
const PAD = 20;
const GAP = 30;
const INSET = { x: 20, y: 40 };
/** An empty zone's automatic width (as the editor sizes it): room for its name, kind and "Nothing drawn yet". */
export const emptyZoneWidth = (label: string, kind: string) =>
  Math.round(label.length * 8.5 + kind.length * 7 + 170);

/** The fixed zones, empty: the regions side by side in the subscription, the data centres and office network in a row below. */
export function fixedZones(hosting: Hosting): Zone[] {
  const names = hostingNames(hosting);
  const empty = (field: HostingField, x: number, y: number): Zone => {
    const { id, kind, parent } = HOSTED_ZONES[field];
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
  const primary = empty('primaryRegion', INSET.x, INSET.y);
  const dr = empty('drRegion', primary.x + primary.width + GAP, INSET.y);
  const subscription = {
    ...empty('subscription', 0, 0),
    width: dr.x + dr.width + PAD,
    height: primary.y + primary.height + PAD,
  };
  const below = subscription.height + GAP;
  const pdc = empty('primaryDc', 0, below);
  const sdc = empty('drDc', pdc.width + GAP, below);
  const office = empty('officeNetwork', sdc.x + sdc.width + GAP, below);
  return [subscription, primary, dr, pdc, sdc, office];
}
