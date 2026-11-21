import { AZURE_ICON_NAMES } from './domain/azure-icons.js';
import { missingFacts, nonCompliantTls, type BLOCK_TYPES, type Box, type DATA_CLASSIFICATIONS, type Diagram, type DiagramSlot, type DiagramView, type Line } from './domain/diagrams.js';
import type { FLOW_TYPES, INFRA_BOX_TYPES, INFRA_ZONE_KINDS, PATTERNS } from './domain/infrastructure.js';
import type { MONITORING_BLOCKS } from './domain/monitoring.js';
import type { PROCESS_STEPS } from './domain/process.js';

// What the SAD PDF calls things on and under its diagrams: the web app's English words (ReactTS_Frontend/src/i18n/en.json, sad.diagram).

const BLOCKS: Record<(typeof BLOCK_TYPES)[number], string> = { actor: 'Actor', part: 'Part of this application', business: 'Business application', external: 'External party' };
const SHAPES: Record<string, string> = {
  person: 'Person',
  external: 'External party',
  web: 'Web',
  api: 'API',
  worker: 'Worker',
  database: 'Database',
  queue: 'Queue',
  storage: 'Storage',
  server: 'Server',
  mobile: 'Mobile app',
  'on-prem': 'On-premises system',
  firewall: 'Firewall',
  wifi: 'Wi-Fi',
  vpn: 'VPN gateway',
};
const STEPS: Record<(typeof PROCESS_STEPS)[number], string> = { start: 'Start', end: 'End', step: 'Step', decision: 'Decision', approval: 'Approval' };
const MONITORING: Record<(typeof MONITORING_BLOCKS)[number], string> = { monitoring: 'Monitoring service', system: 'Other system', team: 'Team / person' };
const INFRA_TYPES: Record<(typeof INFRA_BOX_TYPES)[number], string> = {
  server: 'Server / VM',
  person: 'Person',
  firewall: 'Firewall',
  wifi: 'Wi-Fi',
  vpn: 'VPN gateway',
  web: 'Web (Azure service)',
  api: 'API (Azure service)',
  worker: 'Worker (Azure service)',
  database: 'Database (Azure service)',
  queue: 'Queue (Azure service)',
  storage: 'Storage (Azure service)',
  external: 'External party',
  business: 'Business application',
  azure: 'Azure service',
};
const ZONE_KINDS: Record<(typeof INFRA_ZONE_KINDS)[number] | 'lane', string> = {
  subscription: 'Subscription',
  region: 'Azure region',
  vnet: 'VNet',
  subnet: 'Subnet',
  'data-centre': 'Data centre',
  office: 'Office network',
  internet: 'Internet',
  'azure-global': 'Azure global services',
  'third-party': '3rd party',
  lane: 'Lane',
};
export const CLASSIFICATIONS: Record<(typeof DATA_CLASSIFICATIONS)[number], string> = { public: 'Public', internal: 'Internal', confidential: 'Confidential', 'highly-confidential': 'Highly Confidential' };
export const PATTERN_NAMES: Record<(typeof PATTERNS)[number], string> = { api: 'API', 'web-ui': 'Web UI', file: 'File', event: 'Event / message', database: 'Database' };
export const FLOW_TYPE_NAMES: Record<(typeof FLOW_TYPES)[number], string> = { service: 'Service-to-service', 'end-user': 'End-user-to-service', 'it-admin': 'IT-admin-to-service' };

const named = <T extends string>(names: Record<T, string>, key: string): string | undefined => (Object.hasOwn(names, key) ? names[key as T] : undefined);

/** With an Azure icon, its product name comes first (Microsoft's terms: show it near the icon); an Azure service is just that. */
function withProduct(kind: string, box: Box): string {
  if (!box.icon) return kind;
  // Saved boxes only show icons from the set (the API refuses others).
  const product = AZURE_ICON_NAMES.get(box.icon)!;
  return box.type === 'azure' ? product : `${product} · ${kind}`;
}

const trmOrTyped = (what: string, box: Box) => (box.application ? `${what} · TRM ${box.application.number ?? ''}` : `${what} · typed, not in TRM`);

/** What a box is, as the canvas and tables say under its name: its block type, step, monitoring block or infrastructure kind. */
export function boxKind(slot: DiagramSlot, box: Box): string {
  const { type } = box;
  if (slot === 'infrastructure' && type !== 'business') {
    if (type === 'server' && box.server) return withProduct('Server / VM · TRM', box);
    return withProduct(named(INFRA_TYPES, type) ?? type, box);
  }
  if (type === 'approval') return withProduct(box.approver ? `Approval · ${box.approver}` : 'Approval · who approves still missing', box);
  if (type === 'system') return withProduct(trmOrTyped('Other system', box), box);
  if (type === 'business') return withProduct(trmOrTyped('Business application', box), box);
  return withProduct(named(STEPS, type) ?? named(MONITORING, type) ?? named(BLOCKS, type) ?? named(SHAPES, type) ?? type, box);
}

/** A CI or CD step's kind (who approves has its own column). */
export const stepKind = (type: string): string => named(STEPS, type) ?? type;

/** A zone's kind in words: infrastructure kinds and lanes by name, a grouping box's own text as typed. */
export const zoneKind = (kind: string | undefined): string | undefined => (kind === undefined ? undefined : (named(ZONE_KINDS, kind) ?? kind));

/** Data objects and key attributes, one per line of the text. */
export const dataObjects = (line: Line): string[] =>
  (line.data ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

export const direction = (line: Line): string => (line.twoWay ? 'Two-way' : 'One-way');
export const lineStyle = (line: Line): string => `${line.dashed ? 'Dashed' : 'Solid'} · ${direction(line)}`;

/** The TLS version in words: "1.2", "1.0 (not compliant)", or "Not TLS: SSH". */
export function tlsText(line: Line): string {
  if (!line.tls) return '—';
  if (line.tls === 'none') return line.protection ? `Not TLS: ${line.protection}` : 'Not TLS';
  return nonCompliantTls(line) ? `${line.tls} (not compliant)` : line.tls;
}

/** The name of the API a connection links to (names only, from the API inventory). */
export const apiName = (apis: readonly { id: string; name: string }[], line: Line): string => (line.api ? (apis.find((api) => api.id === line.api!.id)?.name ?? '—') : '—');

/** A box's zone as its full path, outermost first (e.g. "MY01 › Southeast Asia › vnet-crm › snet-app"). */
export function zonePath(diagram: Diagram, id: string): string {
  const zones = new Map(diagram.zones.map((zone) => [zone.id, zone]));
  const path: string[] = [];
  for (let at = diagram.boxes.find((box) => box.id === id)?.parentId; at !== undefined; at = zones.get(at)?.parentId) path.unshift(zones.get(at)!.label);
  return path.join(' › ') || '—';
}

export interface LineLabel {
  label?: string;
  /** Facts needed before submit are missing (drawn with a warning) */
  missing: boolean;
  /** TLS 1.1 or 1.0 (drawn with a warning) */
  nonCompliant?: boolean;
}

/**
 * What a line shows in a view: what it calls (Solution view), its data objects with their classification and frequency
 * (Data flow view), protocol, port and TLS (Integration view), else its label.
 */
export function lineLabel(view: DiagramView, line: Line): LineLabel {
  if (view !== 'solution' && view !== 'data-flow' && view !== 'integration') return { label: line.label, missing: false };
  const missing = missingFacts(view, line).length > 0;
  if (view === 'solution') return { label: line.calls?.trim() || 'Not described yet', missing };
  if (view === 'integration') {
    // "HTTPS 443 · TLS 1.2", "SFTP 22 · SSH".
    const transport = [line.protocol, line.port].filter((part) => part !== undefined).join(' ');
    const security = line.tls === 'none' ? line.protection || 'Not TLS' : line.tls && `TLS ${line.tls}`;
    return { label: [transport || 'Not described yet', security].filter(Boolean).join(' · '), missing, nonCompliant: nonCompliantTls(line) };
  }
  const data = dataObjects(line);
  if (data.length === 0) return { label: 'No data objects', missing };
  const classification = line.classification && CLASSIFICATIONS[line.classification];
  return { label: [data.join('; '), classification, line.frequency?.trim()].filter(Boolean).join(' · '), missing };
}
