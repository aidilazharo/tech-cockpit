import { box, edge, zone, type Diagram, type Side } from './build'
import { AZURE } from './icons'
import type { BoxKind, Facts } from './nodes'
import type { Change } from './style'

// Sample: CRM's solution diagram (logical building blocks) with its Data flow view.

export type BlockType = 'actor' | 'part' | 'business' | 'external'
export const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  actor: 'Actor',
  part: 'Part of this application',
  business: 'Business application',
  external: 'External party',
}
const BOX_KIND: Record<BlockType, BoxKind> = { actor: 'actor', part: 'part', business: 'system', external: 'external' }

export const CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Highly confidential'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

export interface TrmApp {
  apm: string
  name: string
}

/** A sample of TRM applications to search. */
export const TRM_APPS: TrmApp[] = [
  { apm: 'APM-0002', name: 'Policy Admin' },
  { apm: 'APM-0005', name: 'Customer Portal' },
  { apm: 'APM-0007', name: 'Claims Portal' },
  { apm: 'APM-0009', name: 'Agency Management' },
  { apm: 'APM-0011', name: 'Finance GL' },
  { apm: 'APM-0014', name: 'Document Management' },
]

export interface Block {
  id: string
  name: string
  type: BlockType
  /** Position: inside the "CRM" grouping box for parts of this application, otherwise on the canvas */
  x: number
  y: number
  /** Business application picked from TRM (absent when typed) */
  trm?: TrmApp
  icon?: string
}

export interface Link {
  id: string
  from: string
  to: string
  calls: string
  does: string
  direction: 'One-way' | 'Two-way'
  /** Data objects and key attributes, one per line */
  data: string
  classification: Classification | ''
  frequency: string
}

export interface Solution {
  blocks: Block[]
  links: Link[]
}

const GROUP = { x: 300, y: 120 }

export const SAMPLE_SOLUTION: Solution = {
  blocks: [
    { id: 'customer', name: 'Customer', type: 'actor', x: 0, y: 20 },
    { id: 'agent', name: 'Agent', type: 'actor', x: 0, y: 200 },
    { id: 'backoffice', name: 'Back-office staff', type: 'actor', x: 0, y: 360 },
    { id: 'portal', name: 'Customer Portal', type: 'business', x: 320, y: 0, trm: TRM_APPS[1] },
    { id: 'agentportal', name: 'Agent portal', type: 'part', x: 20, y: 80 },
    { id: 'core', name: 'CRM core services', type: 'part', x: 270, y: 150, icon: AZURE.appService },
    { id: 'notify', name: 'Notifications', type: 'part', x: 270, y: 290, icon: AZURE.communication },
    { id: 'policy', name: 'Policy Admin', type: 'business', x: 880, y: 40, trm: TRM_APPS[0] },
    { id: 'bank', name: 'Bank payment gateway', type: 'external', x: 880, y: 200 },
    { id: 'sms', name: 'SMS provider', type: 'external', x: 880, y: 400 },
    { id: 'dwh', name: 'Enterprise data warehouse', type: 'business', x: 880, y: 540 },
  ],
  links: [
    { id: 's1', from: 'customer', to: 'portal', calls: 'Customer Portal (web)', does: 'Self-service: view policies, pay premiums', direction: 'One-way', data: 'Customer profile: name, email, mobile no.', classification: 'Confidential', frequency: 'Real time, ~2,000 sign-ins a day' },
    { id: 's2', from: 'portal', to: 'core', calls: 'CRM Customer API: get profile, update contact', does: "Shows and updates the customer's details", direction: 'Two-way', data: 'Customer: name, IC no., email, mobile no.', classification: 'Highly confidential', frequency: 'Real time, ~20,000 calls a day' },
    { id: 's3', from: 'agent', to: 'agentportal', calls: 'Agent portal (web)', does: 'Agents manage leads and quotes', direction: 'One-way', data: 'Lead: name, mobile no., product interest', classification: 'Confidential', frequency: 'Real time' },
    { id: 's4', from: 'backoffice', to: 'agentportal', calls: 'Agent portal: campaign admin', does: 'Sets up campaigns', direction: 'One-way', data: '', classification: '', frequency: '' },
    { id: 's5', from: 'agentportal', to: 'core', calls: 'CRM Lead API', does: 'Creates and updates leads', direction: 'Two-way', data: 'Lead: name, product interest', classification: 'Confidential', frequency: '' },
    { id: 's6', from: 'core', to: 'policy', calls: 'Policy API: create and read policies', does: 'Issues the policy after payment', direction: 'Two-way', data: 'Policy: policy no., premium, status', classification: 'Confidential', frequency: 'Real time, ~500 a day' },
    { id: 's7', from: 'core', to: 'bank', calls: 'Payment API: charge card', does: 'Collects premium payments', direction: 'Two-way', data: 'Payment: card token, amount, policy no.', classification: 'Highly confidential', frequency: 'Real time, ~800 a day' },
    { id: 's8', from: 'core', to: 'notify', calls: 'LeadCreated, PolicyIssued events', does: 'Triggers customer notifications', direction: 'One-way', data: 'Notification: customer id, template, channel', classification: 'Internal', frequency: 'Real time' },
    { id: 's9', from: 'notify', to: 'sms', calls: 'SMS gateway API', does: 'Sends SMS and email', direction: 'One-way', data: 'Message: mobile no., text', classification: 'Confidential', frequency: '~3,000 a day' },
    { id: 's10', from: 'core', to: 'dwh', calls: 'Nightly customer extract (file)', does: 'Feeds reporting', direction: 'One-way', data: 'Customer and lead: all fields', classification: 'Highly confidential', frequency: 'Nightly batch, ~1 GB' },
  ],
}

export type SolutionView = 'solution' | 'data'

export const blockSub = (block: Block) =>
  block.type === 'business' ? (block.trm ? `Business application · TRM ${block.trm.apm}` : 'Business application · typed, not in TRM') : BLOCK_TYPE_LABEL[block.type]

/** Section 2 facts that block submit: every connection says what it calls and what it does. */
export function solutionTodo(link: Link): string[] {
  return [...(link.calls.trim() ? [] : ['what it calls']), ...(link.does.trim() ? [] : ['what it does'])]
}

/** Facts that block submit: once a connection has data objects, its classification and frequency / volume are required. */
export function dataTodo(link: Link): string[] {
  if (!link.data.trim()) return []
  return [...(link.classification ? [] : ['classification']), ...(link.frequency.trim() ? [] : ['frequency / volume'])]
}

const absolute = (block: Block) => (block.type === 'part' ? { x: GROUP.x + block.x, y: GROUP.y + block.y } : { x: block.x, y: block.y })

/** Which sides a connection leaves and enters, from where the two blocks sit. */
function sides(from: Block, to: Block): [Side, Side] {
  const a = absolute(from)
  const b = absolute(to)
  if (b.x - a.x > 120) return ['r', 'l']
  if (a.x - b.x > 120) return ['l', 'r']
  return b.y > a.y ? ['b', 't'] : ['t', 'b']
}

export interface SolutionOptions {
  /** People who can read section 9 but not section 2 do not see what a connection calls or does (proposal). */
  hideCalls?: boolean
  changes?: Record<string, Change>
  id?: string
  title?: string
}

export function solutionDiagram({ blocks, links }: Solution, view: SolutionView, options: SolutionOptions = {}): Diagram {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const nodes = [
    zone('crm', 'CRM', [GROUP.x, GROUP.y, 470, 380], { kind: 'This application', tone: 'group' }),
    ...blocks.map((block) => {
      const facts: Facts = [['Type', BLOCK_TYPE_LABEL[block.type]]]
      if (block.type === 'business') facts.push(['TRM application', block.trm ? `${block.trm.apm} ${block.trm.name} (mapped)` : 'Not in TRM (typed): not mapped to other applications'])
      return box(block.id, block.type === 'part' ? 'crm' : undefined, [block.x, block.y], {
        label: block.name,
        sub: blockSub(block),
        icon: block.icon,
        kind: BOX_KIND[block.type],
        facts,
        change: options.changes?.[block.id],
      })
    }),
  ]
  const edges = links
    .filter((link) => byId.has(link.from) && byId.has(link.to))
    .map((link) => {
      const [fromSide, toSide] = sides(byId.get(link.from)!, byId.get(link.to)!)
      const data = link.data.split('\n').filter(Boolean)
      const todo = view === 'data' ? dataTodo(link) : solutionTodo(link)
      const callFacts: Facts = options.hideCalls ? [] : [['What it calls', link.calls || '—'], ['What it does', link.does || '—']]
      const dataFacts: Facts =
        view === 'data'
          ? [
              ['Data objects and key attributes', data.length > 0 ? data.join('; ') : 'None recorded (optional)'],
              ['Classification', link.classification || (data.length > 0 ? 'Missing' : '—')],
              ['Frequency / volume', link.frequency || (data.length > 0 ? 'Missing' : '—')],
            ]
          : []
      const lines =
        view === 'solution'
          ? [link.calls || 'No description yet']
          : data.length > 0
            ? [...data, `${link.classification || 'Classification missing'} · ${link.frequency || 'Frequency missing'}`]
            : ['No data objects']
      return edge(link.id, [link.from, fromSide], [link.to, toSide], lines, {
        twoWay: link.direction === 'Two-way',
        missing: todo.length > 0,
        todo,
        facts: [...callFacts, ['Direction', link.direction], ...dataFacts],
        change: options.changes?.[link.id],
      })
    })
  return { id: options.id ?? 'solution', title: options.title ?? 'Solution diagram', sizing: 'auto', nodes, edges }
}

// ----- Logical communication matrix (solution diagram + data flow)

export interface LogicalRow {
  id: string
  source: string
  destination: string
  calls: string
  does: string
  direction: string
  data: string
  classification: string
  frequency: string
}

export function logicalRows({ blocks, links }: Solution): LogicalRow[] {
  const name = (id: string) => blocks.find((b) => b.id === id)?.name ?? id
  return links.map((l) => ({
    id: l.id,
    source: name(l.from),
    destination: name(l.to),
    calls: l.calls,
    does: l.does,
    direction: l.direction,
    data: l.data.split('\n').filter(Boolean).join('; '),
    classification: l.classification,
    frequency: l.frequency,
  }))
}

// ----- Mapping between applications (from each application's latest approved SAD)

export interface AppCall {
  id: string
  caller: string
  callee: string
  calls: string
  does: string
  direction: 'One-way' | 'Two-way'
  /** The approved SAD the call comes from */
  source: string
}

export const APPROVED_CALLS: AppCall[] = [
  { id: 'a1', caller: 'APM-0001 CRM', callee: 'APM-0002 Policy Admin', calls: 'Policy API v1: create policy', does: 'Issues the policy after payment', direction: 'Two-way', source: "CRM's SAD v2 (approved 2026-08-14)" },
  { id: 'a2', caller: 'APM-0005 Customer Portal', callee: 'APM-0002 Policy Admin', calls: 'Policy API: read policy summary', does: 'Shows policies to the customer', direction: 'One-way', source: "Customer Portal's SAD v4 (approved 2026-06-02)" },
  { id: 'a3', caller: 'APM-0002 Policy Admin', callee: 'APM-0011 Finance GL', calls: 'GL posting file', does: 'Posts premiums to the ledger', direction: 'One-way', source: "Policy Admin's SAD v6 (approved 2026-09-30)" },
  { id: 'a4', caller: 'APM-0002 Policy Admin', callee: 'APM-0014 Document Management', calls: 'Document API: store policy schedule', does: 'Keeps the policy schedule PDF', direction: 'Two-way', source: "Policy Admin's SAD v6 (approved 2026-09-30)" },
  { id: 'a5', caller: 'APM-0005 Customer Portal', callee: 'APM-0001 CRM', calls: 'CRM Customer API: get profile', does: "Shows the customer's details", direction: 'Two-way', source: "Customer Portal's SAD v4 (approved 2026-06-02)" },
  { id: 'a6', caller: 'APM-0007 Claims Portal', callee: 'APM-0001 CRM', calls: 'CRM Customer API: get contact details', does: 'Contacts the claimant', direction: 'One-way', source: "Claims Portal's SAD v3 (approved 2026-07-21)" },
  { id: 'a7', caller: 'APM-0001 CRM', callee: 'APM-0005 Customer Portal', calls: 'Portal notification API', does: 'Shows CRM messages in the portal', direction: 'One-way', source: "CRM's SAD v2 (approved 2026-08-14)" },
]

/** One application in the middle, its callers on the left and the applications it calls on the right. */
export function dependencyDiagram(app: string): Diagram {
  const callers = APPROVED_CALLS.filter((c) => c.callee === app)
  const callees = APPROVED_CALLS.filter((c) => c.caller === app)
  const label = (apm: string) => apm.split(' ').slice(1).join(' ')
  const sub = (apm: string) => `TRM ${apm.split(' ')[0]}`
  const height = Math.max(callers.length, callees.length, 1) * 110
  return {
    id: `dependencies-${app}`,
    title: 'Dependencies',
    sizing: 'manual',
    nodes: [
      box('centre', undefined, [360, height / 2 - 30], { label: label(app), sub: sub(app), kind: 'part', facts: [['TRM application', app]] }),
      ...callers.map((c, i) => box(`in-${c.id}`, undefined, [0, i * 110], { label: label(c.caller), sub: sub(c.caller), kind: 'system', facts: [['Calls', c.calls], ['What it does', c.does], ['From', c.source]] })),
      ...callees.map((c, i) => box(`out-${c.id}`, undefined, [720, i * 110], { label: label(c.callee), sub: sub(c.callee), kind: 'system', facts: [['Called with', c.calls], ['What it does', c.does], ['From', c.source]] })),
    ],
    edges: [
      ...callers.map((c) => edge(`e-in-${c.id}`, [`in-${c.id}`, 'r'], ['centre', 'l'], [c.calls], { twoWay: c.direction === 'Two-way', facts: [['What it does', c.does], ['From', c.source]] })),
      ...callees.map((c) => edge(`e-out-${c.id}`, ['centre', 'r'], [`out-${c.id}`, 'l'], [c.calls], { twoWay: c.direction === 'Two-way', facts: [['What it does', c.does], ['From', c.source]] })),
    ],
  }
}

// ----- Version compare: solution diagram v2 (approved) against v3 (this draft)

export interface ChangeRow {
  id: string
  change: Change
  item: string
  before: string
  after: string
}

export const CHANGES: ChangeRow[] = [
  { id: 'x1', change: 'added', item: 'Block: Notifications (part of CRM)', before: '', after: 'Added' },
  { id: 'x2', change: 'added', item: 'Block: SMS provider (external party)', before: '', after: 'Added' },
  { id: 'x3', change: 'added', item: 'Connection: CRM core services → Notifications', before: '', after: 'LeadCreated, PolicyIssued events' },
  { id: 'x4', change: 'added', item: 'Connection: Notifications → SMS provider', before: '', after: 'SMS gateway API' },
  { id: 'x5', change: 'changed', item: 'Connection: CRM core services → Policy Admin', before: 'Policy API v1: create policy', after: 'Policy API: create and read policies' },
  { id: 'x6', change: 'removed', item: 'Connection: Agent portal → Policy Admin', before: 'Policy API v1: get quote', after: 'Removed' },
]

export function compareSolutions(current: Solution): { before: Diagram; after: Diagram } {
  const added = new Set(['notify', 'sms', 's8', 's9'])
  const after = solutionDiagram(current, 'solution', { id: 'v3', title: 'v3', changes: { notify: 'added', sms: 'added', s8: 'added', s9: 'added', s6: 'changed' } })
  const v2: Solution = {
    blocks: current.blocks.filter((b) => !added.has(b.id)),
    links: [
      ...current.links.filter((l) => !added.has(l.id)).map((l) => (l.id === 's6' ? { ...l, calls: 'Policy API v1: create policy' } : l)),
      { id: 'old-quote', from: 'agentportal', to: 'policy', calls: 'Policy API v1: get quote', does: 'Shows quotes to agents', direction: 'Two-way', data: '', classification: '', frequency: '' },
    ],
  }
  const before = solutionDiagram(v2, 'solution', { id: 'v2', title: 'v2', changes: { s6: 'changed', 'old-quote': 'removed' } })
  return { before, after }
}
