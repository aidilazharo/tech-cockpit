import type { Edge, Node } from '@xyflow/react'
import { applySizes, box, edge, fitSizes, lane, step, zone, type Diagram, type Side } from './build'
import { AZURE } from './icons'
import type { FactData, Facts } from './nodes'

// Sample diagrams for CRM (APM-0001), SAD v3 draft.

// ----- Section 3: infrastructure (Azure hierarchy), primary and DR regions on one diagram

/** Names the infrastructure diagram takes from the application's hosting settings. */
export interface Hosting {
  subscription: string
  primaryRegion: string
  drRegion: string
  primaryDc: string
  drDc: string
  officeNetwork: string
}
export type HostingField = keyof Hosting

/** Admin defaults (the "Diagram defaults" screen). */
export const ADMIN_DEFAULTS: Hosting = { subscription: 'MY01', primaryRegion: 'Southeast Asia', drRegion: 'East Asia', primaryDc: 'PDC', drDc: 'SDC', officeNetwork: 'Office network' }

/** Azure's region list (a sample here; the build carries the full list). */
export const AZURE_REGIONS = [
  'Southeast Asia',
  'East Asia',
  'Malaysia West',
  'Indonesia Central',
  'Australia East',
  'Australia Southeast',
  'Japan East',
  'Japan West',
  'Korea Central',
  'Central India',
  'New Zealand North',
  'North Europe',
  'West Europe',
  'East US',
  'West US 2',
]

export const HOSTING_LABEL: Record<HostingField, string> = {
  subscription: 'Subscription',
  primaryRegion: 'Primary region',
  drRegion: 'DR region',
  primaryDc: 'Primary data centre',
  drDc: 'DR data centre',
  officeNetwork: 'Office network',
}

/** Infrastructure zones whose names come from the hosting settings. */
export const ZONE_FIELD: Record<string, HostingField> = { my01: 'subscription', 'sea-region': 'primaryRegion', 'ea-region': 'drRegion', pdc: 'primaryDc', sdc: 'drDc', office: 'officeNetwork' }

type Changed = Partial<Record<HostingField, boolean>>

const nameSource = (changed: boolean | undefined): [string, string] => ['Name comes from', changed ? 'Changed for this diagram' : "This application's hosting settings"]

/** A region inside the subscription: VNet › web, app and DB subnets. The DR region is mirrored so the databases face each other. */
function region(prefix: 'sea' | 'ea', x: number, primary: boolean, name: string, changed: boolean | undefined): Node[] {
  const r = `${prefix}-region`
  const vnet = `${prefix}-vnet`
  const [webX, dbX] = primary ? [15, 445] : [445, 15]
  const server = (id: string, label: string, y: number) =>
    box(id, `${prefix}-app`, [12, y], {
      label,
      sub: 'VM · TRM server',
      icon: AZURE.vm,
      kind: 'part',
      facts: [
        ['TRM server', `${label} (linked)`],
        ['Operating system', 'Windows Server 2022'],
        ['Region', name],
      ],
    })
  return [
    zone(r, name, [x, 35, 690, 360], {
      kind: primary ? 'Azure region · primary' : 'Azure region · DR',
      icon: AZURE.region,
      parent: 'my01',
      facts: [['Region', name], ['Role', primary ? 'Primary' : 'DR'], nameSource(changed)],
    }),
    zone(vnet, primary ? 'vnet-crm-sea' : 'vnet-crm-ea', [15, 35, 660, 230], { kind: primary ? 'VNet · 10.20.0.0/16' : 'VNet · 10.30.0.0/16', icon: AZURE.vnet, tone: 'group', parent: r }),
    zone(`${prefix}-web`, 'snet-web', [webX, 35, 200, 180], { kind: 'Subnet', parent: vnet }),
    zone(`${prefix}-app`, 'snet-app', [230, 35, 200, 180], { kind: 'Subnet', parent: vnet }),
    zone(`${prefix}-db`, 'snet-db', [dbX, 35, 200, 180], { kind: 'Subnet', parent: vnet }),
    box(`${prefix}-webapp`, `${prefix}-web`, [12, 50], {
      label: primary ? 'CRM web' : 'CRM web (standby)',
      sub: 'App Service · VNet integrated',
      icon: AZURE.appService,
      kind: 'part',
      facts: [
        ['Service', 'App Service, Premium v3'],
        ['Region', name],
        ['State', primary ? 'Active' : 'Standby (scaled to 1 instance)'],
      ],
    }),
    ...(primary ? [server('sea-srv1', 'SRV-CRM-01', 40), server('sea-srv2', 'SRV-CRM-02', 110)] : [server('ea-srv1', 'SRV-CRM-DR-01', 40)]),
    box(`${prefix}-sql`, `${prefix}-db`, [12, 50], {
      label: primary ? 'CRM DB (primary)' : 'CRM DB (secondary)',
      sub: primary ? 'Azure SQL · read-write' : 'Azure SQL · geo-secondary',
      icon: AZURE.sqlDatabase,
      kind: 'part',
      facts: [
        ['Service', 'Azure SQL Database, Business Critical'],
        ['Role', primary ? 'Primary (read-write)' : 'Geo-secondary (read-only until failover)'],
        ['Access', 'Private endpoint only'],
      ],
    }),
    box(`${prefix}-kv`, r, [30, 285], { label: primary ? 'Key Vault' : 'Key Vault (DR)', sub: 'Secrets and keys', icon: AZURE.keyVault, kind: 'service' }),
    primary
      ? box('sea-la', r, [460, 285], { label: 'Log Analytics', sub: 'Workspace', icon: AZURE.logAnalytics, kind: 'service' })
      : box('ea-rsv', r, [460, 285], { label: 'Recovery Services vault', sub: 'Site Recovery', icon: AZURE.recoveryVault, kind: 'service' }),
  ]
}

// ----- Integration view: connections between boxes on the infrastructure diagram, with their network facts

export type FlowType = 'service' | 'end-user' | 'it-admin'
export const FLOW_LABEL: Record<FlowType, string> = { service: 'Service-to-service', 'end-user': 'End-user-to-service', 'it-admin': 'IT-admin-to-service' }

export interface IntegrationLink {
  id: string
  from: [string, Side]
  to: [string, Side]
  offset?: number
  protocol: string
  port: string
  tls: string
  direction: 'One-way' | 'Two-way'
  pattern: 'API' | 'Web UI' | 'File' | 'Event / message' | 'Database'
  authentication: string
  classification: 'Public' | 'Internal' | 'Confidential' | 'Highly confidential'
  purpose: string
  flow: FlowType
  /** The API in this SAD's API inventory (required for the API pattern) */
  api?: string
}

const REQUIRED: [keyof IntegrationLink, string][] = [
  ['protocol', 'protocol'],
  ['port', 'port'],
  ['tls', 'TLS version'],
  ['authentication', 'authentication'],
  ['classification', 'classification'],
  ['purpose', 'purpose'],
]

/** Required facts a connection still lacks (the API link too, for the API pattern). */
export function missingFacts(link: IntegrationLink): string[] {
  const missing = REQUIRED.filter(([key]) => !link[key]).map(([, label]) => label)
  if (link.pattern === 'API' && !link.api) missing.push('API from the inventory')
  return missing
}

function integrationEdge(link: IntegrationLink): Edge<FactData> {
  const todo = missingFacts(link)
  const facts: Facts = [
    ['Protocol and port', `${link.protocol} ${link.port}`],
    ['TLS version', link.tls],
    ['Direction', link.direction],
    ['Pattern', link.pattern],
    ['Authentication', link.authentication || 'Missing'],
    ...(link.pattern === 'API' ? ([['API (from the API inventory)', link.api ?? 'Missing']] as Facts) : []),
    ['Classification', link.classification],
    ['Purpose', link.purpose],
    ['Flow type', FLOW_LABEL[link.flow]],
  ]
  return edge(link.id, link.from, link.to, [`${link.protocol} ${link.port} · ${link.tls === 'SSH' ? 'SSH' : `TLS ${link.tls}`}`, link.authentication || 'Authentication missing'], {
    layer: 'integration',
    twoWay: link.direction === 'Two-way',
    offset: link.offset,
    missing: todo.length > 0,
    todo,
    facts,
    row: {
      protocol: link.protocol,
      port: link.port,
      tls: link.tls,
      direction: link.direction,
      pattern: link.pattern,
      authentication: link.authentication,
      api: link.pattern === 'API' ? (link.api ?? '') : '—',
      classification: link.classification,
      purpose: link.purpose,
      flow: FLOW_LABEL[link.flow],
    },
  })
}

const PRODUCTION_LINKS: IntegrationLink[] = [
  { id: 'g1', from: ['customer', 'b'], to: ['frontdoor', 't'], protocol: 'HTTPS', port: '443', tls: '1.3', direction: 'One-way', pattern: 'Web UI', authentication: 'Entra External ID (OIDC)', classification: 'Confidential', purpose: 'Customer portal sign-in and self-service', flow: 'end-user' },
  { id: 'g2', from: ['frontdoor', 'l'], to: ['sea-webapp', 'l'], offset: 80, protocol: 'HTTPS', port: '443', tls: '1.2', direction: 'One-way', pattern: 'Web UI', authentication: 'Private Link origin', classification: 'Confidential', purpose: 'Route portal traffic to the web app', flow: 'service' },
  { id: 'g3', from: ['office-agent', 'l'], to: ['sea-webapp', 'l'], offset: 60, protocol: 'HTTPS', port: '443', tls: '1.2', direction: 'One-way', pattern: 'Web UI', authentication: 'Entra ID SSO', classification: 'Confidential', purpose: 'Agent portal', flow: 'end-user' },
  { id: 'g4', from: ['sea-webapp', 'r'], to: ['sea-srv1', 'l'], protocol: 'HTTPS', port: '443', tls: '1.2', direction: 'Two-way', pattern: 'API', authentication: 'OAuth 2.0 client credentials', classification: 'Confidential', purpose: 'Customer and lead operations', flow: 'service', api: 'Customer API' },
  { id: 'g5', from: ['sea-srv1', 'r'], to: ['sea-sql', 'l'], protocol: 'TDS', port: '1433', tls: '1.2', direction: 'Two-way', pattern: 'Database', authentication: 'Managed identity', classification: 'Highly confidential', purpose: 'Store customers and leads', flow: 'service' },
  { id: 'g6', from: ['sea-srv2', 'r'], to: ['policy', 't'], protocol: 'HTTPS', port: '443', tls: '1.2', direction: 'Two-way', pattern: 'API', authentication: '', classification: 'Confidential', purpose: 'Create and read policies (over ExpressRoute)', flow: 'service', api: 'Policy API' },
  { id: 'g7', from: ['sea-srv1', 't'], to: ['bank', 'b'], protocol: 'HTTPS', port: '443', tls: '1.2', direction: 'Two-way', pattern: 'API', authentication: 'OAuth 2.0 + mTLS', classification: 'Highly confidential', purpose: 'Collect premium payments', flow: 'service', api: 'Payment API' },
  { id: 'g8', from: ['office-admin', 'r'], to: ['sea-sql', 'r'], protocol: 'TDS', port: '1433', tls: '1.2', direction: 'One-way', pattern: 'Database', authentication: 'Entra ID + PIM, via Bastion', classification: 'Highly confidential', purpose: 'Support and maintenance', flow: 'it-admin' },
  { id: 'g9', from: ['sea-srv2', 'b'], to: ['pdc-srv', 'l'], protocol: 'SFTP', port: '22', tls: 'SSH', direction: 'One-way', pattern: 'File', authentication: 'SSH key', classification: 'Confidential', purpose: 'Nightly letters file for printing', flow: 'service' },
]

const NON_PRODUCTION_LINKS: IntegrationLink[] = [
  { id: 'n1', from: ['np-web', 'b'], to: ['np-srv', 't'], protocol: 'HTTPS', port: '443', tls: '1.2', direction: 'Two-way', pattern: 'API', authentication: 'OAuth 2.0 client credentials', classification: 'Confidential', purpose: 'SIT and UAT testing', flow: 'service', api: 'Customer API' },
  { id: 'n2', from: ['np-srv', 'r'], to: ['np-sql', 'l'], protocol: 'TDS', port: '1433', tls: '1.2', direction: 'Two-way', pattern: 'Database', authentication: 'Managed identity', classification: 'Confidential', purpose: 'Test data (masked)', flow: 'service' },
]

/** The infrastructure diagram with the names it uses (the application's settings, or the diagram's own where changed). */
export function infrastructureDiagram(names: Hosting, changed: Changed = {}): Diagram {
  return {
    id: 'infrastructure',
    title: 'Production',
    sizing: 'manual',
    nodes: [
      zone('internet', 'Internet', [565, 0, 320, 110]),
      box('customer', 'internet', [72, 40], { label: 'Customer', sub: 'End user', kind: 'actor' }),
      zone('third', '3rd party', [960, 0, 320, 110]),
      box('bank', 'third', [72, 40], { label: 'Bank payment gateway', sub: 'External party', kind: 'external' }),
      zone('global', 'Azure global services', [545, 140, 360, 110]),
      box('frontdoor', 'global', [92, 40], { label: 'Front Door + WAF', sub: 'Azure Front Door Premium', icon: AZURE.frontDoor, kind: 'service' }),
      // One subscription holds the primary and DR regions.
      zone('my01', names.subscription, [0, 290, 1450, 410], {
        kind: 'Subscription',
        icon: AZURE.subscription,
        facts: [['Subscription', names.subscription], ['Holds', 'The primary and DR regions, all environments'], nameSource(changed.subscription)],
      }),
      ...region('sea', 15, true, names.primaryRegion, changed.primaryRegion),
      ...region('ea', 745, false, names.drRegion, changed.drRegion),
      // On-premises, outside the subscription: the primary and DR data centres hold servers only.
      zone('pdc', names.primaryDc, [15, 730, 690, 120], {
        kind: 'Primary data centre · on-premises',
        facts: [['Data centre', names.primaryDc], ['Role', 'Primary'], nameSource(changed.primaryDc)],
      }),
      box('pdc-srv', 'pdc', [400, 45], {
        label: 'SRV-CRM-BATCH-01',
        sub: 'Server · TRM server',
        kind: 'part',
        facts: [
          ['TRM server', 'SRV-CRM-BATCH-01 (linked)'],
          ['Role', 'Nightly batch and letter printing'],
          ['Operating system', 'Red Hat Enterprise Linux 9'],
          ['Data centre', `${names.primaryDc} (primary)`],
        ],
      }),
      zone('sdc', names.drDc, [745, 730, 690, 120], {
        kind: 'Secondary data centre · DR · on-premises',
        facts: [['Data centre', names.drDc], ['Role', 'DR'], nameSource(changed.drDc)],
      }),
      box('sdc-srv', 'sdc', [40, 45], {
        label: 'SRV-CRM-BATCH-DR-01',
        sub: 'Server · TRM server',
        kind: 'part',
        facts: [
          ['TRM server', 'SRV-CRM-BATCH-DR-01 (linked)'],
          ['Role', 'DR for SRV-CRM-BATCH-01'],
          ['Operating system', 'Red Hat Enterprise Linux 9'],
          ['Data centre', `${names.drDc} (DR)`],
        ],
      }),
      // Another business application (from TRM), placed on the diagram: shows in both views.
      box('policy', undefined, [1480, 900], { label: 'Policy Admin', sub: 'Business application · TRM APM-0002', kind: 'system', facts: [['TRM application', 'APM-0002 Policy Admin (mapped)'], ['Hosted', 'On-premises (its own SAD)']] }),
      // Office network: one more on-prem zone, no DR partner; servers, people and network devices.
      zone('office', names.officeNetwork, [15, 880, 690, 200], {
        kind: 'Office · on-premises',
        facts: [['Office network', names.officeNetwork], ['Holds', 'Servers, people and network devices'], ['DR', 'None'], nameSource(changed.officeNetwork)],
      }),
      box('office-agent', 'office', [30, 40], { label: 'Agent', sub: 'Staff in the office', kind: 'actor' }),
      box('office-admin', 'office', [30, 120], { label: 'IT admin', sub: 'Admin access via PIM', kind: 'actor' }),
      box('office-fw', 'office', [420, 40], { label: 'Office firewall', sub: 'Firewall · network device', kind: 'device', facts: [['Device', 'Firewall'], ['Location', names.officeNetwork]] }),
    ],
    edges: [
      // Infrastructure lines (Infrastructure view): origins, replication, failover, ExpressRoute, WAN
      edge('i2', ['frontdoor', 'l'], ['sea-webapp', 'l'], ['Primary origin'], { offset: 80 }),
      edge('i3', ['frontdoor', 'r'], ['ea-webapp', 'r'], ['Failover origin'], { dashed: true, offset: 80 }),
      edge('i8', ['sea-sql', 'r'], ['ea-sql', 'l'], ['Active geo-replication (async)'], { dashed: true, facts: [['Purpose', 'DR replication'], ['Mode', 'Asynchronous'], ['Failover', 'Failover group, manual']] }),
      edge('i9', ['sea-srv2', 'r'], ['ea-rsv', 't'], ['Site Recovery replication'], { dashed: true }),
      edge('i10', ['sea-vnet', 'b'], ['pdc', 't'], ['ExpressRoute private peering'], { twoWay: true }),
      edge('i11', ['ea-vnet', 'b'], ['sdc', 't'], ['ExpressRoute (DR)'], { twoWay: true, dashed: true }),
      edge('i12', ['pdc-srv', 'r'], ['sdc-srv', 'l'], ['VM replication (DR)'], { dashed: true }),
      edge('i13', ['office-agent', 'r'], ['office-fw', 'l'], ['HTTPS 443']),
      edge('i14', ['office-admin', 'r'], ['office-fw', 'l'], ['Admin access']),
      edge('i15', ['office-fw', 't'], ['pdc', 'b'], ['Corporate WAN'], { twoWay: true }),
      // Integration connections (Integration view)
      ...PRODUCTION_LINKS.map(integrationEdge),
    ].map((e) => (e.data?.layer ? e : { ...e, data: { ...e.data!, layer: 'infra' as const } })),
  }
}

/**
 * Non-production: only the primary region is used, so the DR region and both data centres are empty and shrink
 * to their names. Every zone is sized automatically.
 */
export function nonProductionDiagram(names: Hosting, changed: Changed = {}): Diagram {
  const nodes: Node[] = [
    zone('my01', names.subscription, [0, 0, 0, 0], {
      kind: 'Subscription',
      icon: AZURE.subscription,
      facts: [['Subscription', names.subscription], ['Holds', 'The primary and DR regions, all environments'], nameSource(changed.subscription)],
    }),
    zone('sea-region', names.primaryRegion, [15, 35, 0, 0], {
      kind: 'Azure region · primary',
      icon: AZURE.region,
      parent: 'my01',
      facts: [['Region', names.primaryRegion], ['Role', 'Primary'], nameSource(changed.primaryRegion)],
    }),
    zone('np-vnet', 'vnet-crm-nonprod', [15, 35, 0, 0], { kind: 'VNet · 10.40.0.0/16', icon: AZURE.vnet, tone: 'group', parent: 'sea-region' }),
    zone('np-app', 'snet-app', [15, 35, 0, 0], { kind: 'Subnet', parent: 'np-vnet' }),
    zone('np-db', 'snet-db', [230, 35, 0, 0], { kind: 'Subnet', parent: 'np-vnet' }),
    box('np-web', 'np-app', [12, 40], { label: 'CRM web (SIT, UAT)', sub: 'App Service', icon: AZURE.appService, kind: 'part' }),
    box('np-srv', 'np-app', [12, 150], { label: 'SRV-CRM-UAT-01', sub: 'VM · TRM server', icon: AZURE.vm, kind: 'part', facts: [['TRM server', 'SRV-CRM-UAT-01 (linked)'], ['Environments', 'SIT, UAT']] }),
    box('np-sql', 'np-db', [12, 40], { label: 'CRM DB (SIT, UAT)', sub: 'Azure SQL', icon: AZURE.sqlDatabase, kind: 'part' }),
    zone('ea-region', names.drRegion, [0, 35, 0, 0], {
      kind: 'Azure region · DR',
      icon: AZURE.region,
      parent: 'my01',
      facts: [['Region', names.drRegion], ['Role', 'DR'], ['Contents', 'Empty, so it shrinks to its name'], nameSource(changed.drRegion)],
    }),
    zone('pdc', names.primaryDc, [0, 0, 0, 0], {
      kind: 'Primary data centre · on-premises',
      facts: [['Data centre', names.primaryDc], ['Role', 'Primary'], ['Contents', 'Empty, so it shrinks to its name'], nameSource(changed.primaryDc)],
    }),
    zone('sdc', names.drDc, [0, 0, 0, 0], {
      kind: 'Secondary data centre · DR · on-premises',
      facts: [['Data centre', names.drDc], ['Role', 'DR'], ['Contents', 'Empty, so it shrinks to its name'], nameSource(changed.drDc)],
    }),
    zone('office', names.officeNetwork, [0, 0, 0, 0], {
      kind: 'Office · on-premises',
      facts: [['Office network', names.officeNetwork], ['DR', 'None'], ['Contents', 'Empty, so it shrinks to its name'], nameSource(changed.officeNetwork)],
    }),
  ]
  // Size the regions first, then place their neighbours, then size the subscription around them.
  const move = (id: string, x: number | null, y: number | null) => {
    const node = nodes.find((n) => n.id === id)!
    node.position = { x: x ?? node.position.x, y: y ?? node.position.y }
  }
  move('ea-region', 15 + fitSizes(nodes).get('sea-region')![0] + 40, null)
  const sizes = fitSizes(nodes)
  move('pdc', null, sizes.get('my01')![1] + 30)
  move('sdc', sizes.get('pdc')![0] + 30, sizes.get('my01')![1] + 30)
  move('office', sizes.get('pdc')![0] + 30 + sizes.get('sdc')![0] + 30, sizes.get('my01')![1] + 30)
  return {
    id: 'non-production',
    title: 'Non-production',
    sizing: 'auto',
    nodes: applySizes(nodes, fitSizes(nodes)),
    edges: NON_PRODUCTION_LINKS.map(integrationEdge),
  }
}

// ----- Section 10: CI and CD process flows (lanes per team or tool)

const WIDE = 1420

export const CI_FLOW: Diagram = {
  id: 'ci',
  title: 'CI flow',
  nodes: [
    lane('dev', 'Developer', 0, WIDE),
    lane('ado', 'Azure DevOps', 160, WIDE),
    lane('sec', 'Security scans', 320, WIDE),
    step('c-start', 'dev', [150, 50], 'Code change', 'start'),
    step('c-pr', 'dev', [390, 50], 'Open pull request'),
    step('c-review', 'ado', [422, 19], 'Reviewer approves?', 'decision'),
    step('c-build', 'ado', [640, 50], 'Build and unit tests'),
    step('c-scan', 'sec', [640, 50], 'SAST and SCA scans'),
    step('c-gate', 'sec', [902, 19], 'Within policy?', 'decision'),
    step('c-publish', 'ado', [1100, 50], 'Publish artefact'),
    step('c-fail', 'sec', [1100, 50], 'Fail build, notify developer'),
  ],
  edges: [
    edge('ci1', ['c-start', 'r'], ['c-pr', 'l'], []),
    edge('ci2', ['c-pr', 'b'], ['c-review', 't'], []),
    edge('ci3', ['c-review', 'l'], ['c-start', 'b'], ['No: changes requested']),
    edge('ci4', ['c-review', 'r'], ['c-build', 'l'], ['Yes']),
    edge('ci5', ['c-build', 'b'], ['c-scan', 't'], []),
    edge('ci6', ['c-scan', 'r'], ['c-gate', 'l'], []),
    edge('ci7', ['c-gate', 't'], ['c-publish', 'b'], ['Yes']),
    edge('ci8', ['c-gate', 'r'], ['c-fail', 'l'], ['No']),
  ],
}

export const CD_FLOW: Diagram = {
  id: 'cd',
  title: 'CD flow',
  nodes: [
    lane('ado', 'Azure DevOps', 0, WIDE),
    lane('snow', 'ServiceNow change', 160, WIDE),
    lane('owner', 'Application manager', 320, WIDE),
    step('d-start', 'ado', [150, 50], 'Artefact published', 'start'),
    step('d-uat', 'ado', [380, 50], 'Deploy to SIT and UAT'),
    step('d-cr', 'snow', [380, 50], 'Raise change request'),
    step('d-approve', 'owner', [412, 19], 'Change approved?', 'decision'),
    step('d-prod', 'ado', [700, 50], 'Deploy to production'),
    step('d-health', 'ado', [962, 19], 'Smoke tests pass?', 'decision'),
    step('d-close', 'snow', [1160, 50], 'Close change'),
    step('d-rollback', 'snow', [930, 50], 'Roll back, update change'),
  ],
  edges: [
    edge('cd1', ['d-start', 'r'], ['d-uat', 'l'], []),
    edge('cd2', ['d-uat', 'b'], ['d-cr', 't'], []),
    edge('cd3', ['d-cr', 'b'], ['d-approve', 't'], []),
    edge('cd4', ['d-approve', 'r'], ['d-prod', 'b'], ['Yes']),
    edge('cd5', ['d-prod', 'r'], ['d-health', 'l'], []),
    edge('cd6', ['d-health', 'r'], ['d-close', 't'], ['Yes']),
    edge('cd7', ['d-health', 'b'], ['d-rollback', 't'], ['No']),
  ],
}

// ----- Section 12: monitoring (logical building blocks)

export const MONITORING: Diagram = {
  id: 'monitoring',
  title: 'Logging and monitoring',
  sizing: 'manual',
  nodes: [
    zone('crm', 'CRM', [0, 0, 220, 330], { kind: 'This application', tone: 'group' }),
    box('web', 'crm', [22, 50], { label: 'CRM web', sub: 'App Service', icon: AZURE.appService, kind: 'part' }),
    box('api', 'crm', [22, 150], { label: 'CRM API', sub: 'App Service', icon: AZURE.appService, kind: 'part' }),
    box('db', 'crm', [22, 250], { label: 'CRM DB', sub: 'Azure SQL', icon: AZURE.sqlDatabase, kind: 'part' }),
    box('ai', undefined, [300, 90], { label: 'Application Insights', sub: 'Telemetry', icon: AZURE.appInsights, kind: 'service' }),
    box('la', undefined, [300, 250], { label: 'Log Analytics', sub: 'Workspace, 90 days', icon: AZURE.logAnalytics, kind: 'service' }),
    box('alerts', undefined, [560, 90], { label: 'Azure Monitor alerts', sub: 'Alert rules', icon: AZURE.monitor, kind: 'service' }),
    box('sentinel', undefined, [560, 250], { label: 'Sentinel', sub: 'SIEM', icon: AZURE.sentinel, kind: 'service' }),
    box('dash', undefined, [560, 390], { label: 'Workbooks', sub: 'Dashboards', icon: AZURE.workbooks, kind: 'service' }),
    box('snow', undefined, [830, 90], { label: 'ServiceNow', sub: 'TRM · incident', kind: 'system' }),
    box('soc', undefined, [830, 250], { label: 'Security operations', sub: 'Actor', kind: 'actor' }),
    box('support', undefined, [830, 390], { label: 'Support team', sub: 'Actor', kind: 'actor' }),
  ],
  edges: [
    edge('m1', ['web', 'r'], ['ai', 'l'], ['Telemetry']),
    edge('m2', ['api', 'r'], ['ai', 'l'], []),
    edge('m3', ['db', 'r'], ['la', 'l'], ['Diagnostic logs']),
    edge('m4', ['ai', 'b'], ['la', 't'], ['Workspace-based']),
    edge('m5', ['la', 'r'], ['alerts', 'l'], ['Alert rules']),
    edge('m6', ['la', 'r'], ['sentinel', 'l'], ['Security events']),
    edge('m7', ['la', 'b'], ['dash', 'l'], ['Dashboards']),
    edge('m8', ['alerts', 'r'], ['snow', 'l'], ['Incident']),
    edge('m9', ['sentinel', 'r'], ['soc', 'l'], ['Security incident']),
    edge('m10', ['dash', 'r'], ['support', 'l'], []),
  ],
}
