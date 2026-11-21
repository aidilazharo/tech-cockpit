import { Background, ConnectionMode, Controls, ReactFlow, useNodesState, type Edge, type Node } from '@xyflow/react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button, Checkbox, DataTable, Dropdown, PageMessage, Tag, Textarea, TextField, type DataTableColumn } from '../../src/components/qi'
import { cn } from '../../src/lib/cn'
import { EDGE_TYPES, fitLayout, NODE_TYPES, type Diagram } from './build'
import { ADMIN_DEFAULTS, AZURE_REGIONS, CD_FLOW, CI_FLOW, HOSTING_LABEL, infrastructureDiagram, MONITORING, nonProductionDiagram, ZONE_FIELD, type Hosting, type HostingField } from './diagrams'
import { Fact, type FactData, type Facts } from './nodes'
import {
  APPROVED_CALLS,
  BLOCK_TYPE_LABEL,
  blockSub,
  CHANGES,
  CLASSIFICATIONS,
  compareSolutions,
  dataTodo,
  solutionTodo,
  dependencyDiagram,
  logicalRows,
  SAMPLE_SOLUTION,
  solutionDiagram,
  TRM_APPS,
  type AppCall,
  type Block,
  type BlockType,
  type ChangeRow,
  type Classification,
  type Link,
  type LogicalRow,
  type Solution,
  type SolutionView,
  type TrmApp,
} from './solution'
import { CHANGE_CLASS, CHANGE_LABEL, SelectContext, type Change } from './style'

type SlotId = 's2-solution' | 's2-integration' | 's2-matrices' | 's3-infra' | 's4-ha' | 's9-flow' | 's10-cicd' | 's12-monitoring' | 'compare' | 'trm' | 'admin'

const NAV: { section: string; slots: { id: SlotId; label: string }[] }[] = [
  {
    section: '2. Solution & Integration Architecture',
    slots: [
      { id: 's2-solution', label: 'Solution diagram' },
      { id: 's2-integration', label: 'Integration diagram' },
      { id: 's2-matrices', label: 'Communication matrices' },
    ],
  },
  { section: '3. Physical and Network Architecture', slots: [{ id: 's3-infra', label: 'Infrastructure diagram' }] },
  { section: '4. High Availability and Resiliency', slots: [{ id: 's4-ha', label: 'Infrastructure (read-only)' }] },
  { section: '9. Data Architecture & Data Flow', slots: [{ id: 's9-flow', label: 'Data flow diagram' }] },
  { section: '10. Deployment Architecture', slots: [{ id: 's10-cicd', label: 'CI and CD flows' }] },
  { section: '12. Logging & Monitoring', slots: [{ id: 's12-monitoring', label: 'Monitoring diagram' }] },
  { section: 'Versions', slots: [{ id: 'compare', label: 'Compare v2 with v3' }] },
  { section: 'TRM (outside the SAD)', slots: [{ id: 'trm', label: 'Application connections' }] },
  { section: 'Admin settings', slots: [{ id: 'admin', label: 'Diagram defaults' }] },
]

export function App() {
  const [slot, setSlot] = useState<SlotId>('s2-solution')
  const [hosting, setHosting] = useState<Hosting>(ADMIN_DEFAULTS)
  const [changed, setChanged] = useState<Record<string, Partial<Hosting>>>({})
  const [copied, setCopied] = useState(0)
  const [solution, setSolution] = useState<Solution>(SAMPLE_SOLUTION)
  const infra: InfraState = { hosting, setHosting, changed, setChanged, copied, setCopied }
  return (
    <div className="min-h-screen bg-surface-default text-text-default">
      <header className="border-b border-divider-default px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="heading-3">SAD diagrams</h1>
          <Tag emphasis="new">Prototype</Tag>
        </div>
        <p className="text-sm text-text-subdued">CRM · APM-0001 · SAD v3 (draft) · sample data: nothing is saved; buttons that are not built yet explain what they will do.</p>
      </header>
      <div className="flex flex-col md:flex-row">
        <div className="border-b border-divider-default px-4 py-3 md:hidden">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Diagram slot
            <select
              value={slot}
              onChange={(event) => setSlot(event.target.value as SlotId)}
              className="min-h-10 rounded-form border border-border-default bg-surface-enabled-1 px-3 text-base font-normal text-text-default focus:outline-2 focus:outline-border-focus"
            >
              {NAV.map((group) => (
                <optgroup key={group.section} label={group.section}>
                  {group.slots.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <nav aria-label="Diagram slots" className="hidden shrink-0 border-r border-divider-default p-4 md:block md:w-72">
          {NAV.map((group) => (
            <div key={group.section} className="mb-4">
              <p className="mb-1 text-xs font-semibold text-text-subdued">{group.section}</p>
              <ul>
                {group.slots.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={slot === item.id ? 'page' : undefined}
                      onClick={() => setSlot(item.id)}
                      className={cn(
                        'w-full rounded-button px-3 py-2 text-left text-sm hover:bg-surface-hover-1',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
                        slot === item.id && 'bg-surface-selected-1 font-semibold',
                      )}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <SlotView key={slot} slot={slot} infra={infra} solution={solution} setSolution={setSolution} />
        </main>
      </div>
    </div>
  )
}

function SlotView({ slot, infra, solution, setSolution }: { slot: SlotId; infra: InfraState; solution: Solution; setSolution: (solution: Solution) => void }) {
  switch (slot) {
    case 's2-solution':
      return (
        <Slot section="Section 2" title="Solution diagram" intro="Logical building blocks: actors, this application's parts, other business applications and external parties. Each connection says what it calls, what it does and its direction. The same diagram has a Data flow view, shown in section 9.">
          <SolutionEditor solution={solution} setSolution={setSolution} initialView="solution" />
        </Slot>
      )
    case 's2-integration':
      return (
        <Slot section="Section 2" title="Integration diagram" intro="The infrastructure diagram's Integration view: the same zones and boxes (edited in section 3) with the integration connections and their network facts. Production and Non-production tabs, as in section 3.">
          <InfraEditor infra={infra} view="integration" />
        </Slot>
      )
    case 's2-matrices':
      return (
        <Slot section="Section 2" title="Communication matrices" notApplicable={false}>
          <Matrices infra={infra} solution={solution} />
        </Slot>
      )
    case 's3-infra':
      return (
        <Slot section="Section 3" title="Infrastructure diagram" intro="Azure as subscription › region › VNet › subnet, with the primary and DR regions in one subscription, plus the on-prem primary and DR data centres (servers only) and the office network (servers, people and network devices; no DR). This view shows the infrastructure lines; integration connections are in section 2.">
          <InfraEditor infra={infra} view="infra" />
        </Slot>
      )
    case 's4-ha':
      return (
        <Slot section="Section 4" title="High availability and resiliency" notApplicable={false}>
          <PageMessage>Reuses section 3&apos;s infrastructure diagram (both tabs), read-only: everything is already there. Dashed lines are replication and failover. Change it in section 3.</PageMessage>
          <InfraEditor infra={infra} view="infra" readOnly />
        </Slot>
      )
    case 's9-flow':
      return (
        <Slot section="Section 9" title="Data flow diagram" intro="The solution diagram's Data flow view: per connection, the data objects passed and their key attributes, the classification and the frequency / volume. It replaces the separate data model slot.">
          <SolutionEditor solution={solution} setSolution={setSolution} initialView="data" section9 />
        </Slot>
      )
    case 's10-cicd':
      return (
        <Slot section="Section 10" title="CI and CD flows" intro="Process flows: a lane per team or tool, with steps, approvals and decision points. Several diagrams, each with a title.">
          <GenericEditor diagrams={[CI_FLOW, CD_FLOW]} actions={[ACTIONS.lane, ACTIONS.step, ACTIONS.decision, ACTIONS.connection, ACTIONS.drawio]} />
        </Slot>
      )
    case 's12-monitoring':
      return (
        <Slot section="Section 12" title="Monitoring diagram" intro="Logical building blocks.">
          <GenericEditor diagrams={[MONITORING]} actions={[ACTIONS.monitoringBlock, ACTIONS.connection, ACTIONS.group, ACTIONS.drawio]} />
        </Slot>
      )
    case 'compare':
      return (
        <Slot section="Version compare" title="Solution diagram: v2 (approved) and v3 (draft)" notApplicable={false}>
          <Compare solution={solution} />
        </Slot>
      )
    case 'trm':
      return <TrmConnections />
    case 'admin':
      return <AdminSettings />
  }
}

// ----- Slot frame: answered by diagrams or by Not applicable with a reason

function Slot({ section, title, intro, notApplicable = true, children }: { section: string; title: string; intro?: string; notApplicable?: boolean; children: ReactNode }) {
  const [answer, setAnswer] = useState<'diagram' | 'na'>('diagram')
  return (
    <section aria-labelledby="slot-title" className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-text-subdued">{section}</p>
        <h2 id="slot-title" className="heading-4">
          {title}
        </h2>
        {intro && <p className="max-w-4xl text-sm text-text-subdued">{intro}</p>}
      </div>
      {notApplicable && (
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">Answer</legend>
          <Radio name="answer" label="Diagram" checked={answer === 'diagram'} onChange={() => setAnswer('diagram')} />
          <Radio name="answer" label="Not applicable" checked={answer === 'na'} onChange={() => setAnswer('na')} />
        </fieldset>
      )}
      {answer === 'na' ? (
        <div className="max-w-2xl">
          <Textarea label="Why is this not applicable?" hint="Required, like any other Not applicable answer." defaultValue="" />
        </div>
      ) : (
        children
      )}
    </section>
  )
}

function Radio({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-4 accent-icon-selected" />
      {label}
    </label>
  )
}

/** A row of mutually exclusive options (diagram titles, views, filters). */
function Choice<V extends string>({ label, options, value, onChange }: { label: string; options: { value: V; label: string }[]; value: V; onChange: (value: V) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-button border border-divider-default p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-button px-3 py-1.5 text-sm',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
            value === option.value ? 'bg-surface-selected-1 font-semibold text-text-selected' : 'text-text-subdued hover:bg-surface-hover-1',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ----- Toolbar: dummy actions that explain the real build

interface Action {
  label: string
  note: string
}

const ACTIONS: Record<string, Action> = {
  component: { label: 'Add component', note: 'Pick a type (any Azure icon, searchable, or a generic shape), name it and choose its zone. It appears on the canvas and in the components table.' },
  system: { label: 'Add other system', note: 'Pick an application from TRM (linked, shows its APM number) or type an external party or SaaS.' },
  connection: { label: 'Add connection', note: "Drag from one box's edge to another, or pick From and To in the connections table, then fill in the facts." },
  zone: { label: 'Add zone', note: 'Pick from the AIA zone list (maintained by system admins and enterprise architects) or type your own; zones can be nested.' },
  azureZone: { label: 'Add VNet or subnet', note: 'Add a VNet inside a region, or a subnet inside a VNet. The subscription, regions and data centres take their names from this application\'s hosting settings above.' },
  azure: { label: 'Add Azure service', note: 'Search every Azure icon (App Service, SQL Database, Key Vault...) and place it in a zone.' },
  server: { label: 'Add server', note: "Pick one of the application's TRM servers (linked, the PDF shows its TRM name) or type one that is not in TRM. Place it in an Azure subnet, directly in PDC or SDC, or in the office network." },
  personDevice: { label: 'Add person or device', note: 'People (e.g. staff, agents, IT admins) and network devices (e.g. firewall, Wi-Fi, VPN gateway) go in the office network.' },
  monitoringBlock: { label: 'Add block', note: 'Add a part of this application, a monitoring service (Azure icons available) or a team.' },
  otherApp: { label: 'Add other application or party', note: 'Search TRM applications (those already on the solution diagram are offered first, not linked) or type an external party, and place it on the diagram. It shows in both views. Section 2 or section 3 editors.' },
  integrationConnection: { label: 'Add integration connection', note: 'Pick From and To boxes, then fill in protocol, port, TLS, direction, pattern, authentication, classification, purpose, flow type and, for the API pattern, the API from the inventory. Section 2 editors.' },
  infraLine: { label: 'Add line', note: 'Infrastructure lines: replication, failover, ExpressRoute, WAN. Integration connections are added in section 2.' },
  group: { label: 'Add grouping box', note: 'Draw a box around related blocks, e.g. "CRM".' },
  lane: { label: 'Add lane', note: 'A lane per team or tool, e.g. Azure DevOps or ServiceNow change.' },
  step: { label: 'Add step', note: 'A step inside a lane.' },
  decision: { label: 'Add decision', note: 'A decision point (diamond) with labelled Yes/No connections.' },
  drawio: { label: 'Import draw.io', note: 'Shapes become components (Azure icons matched by name, otherwise generic boxes), containers become zones, groups or lanes, arrows become connections; labels are kept. The original file is kept as an upload. Missing facts must be filled in before submit.' },
  diagram: { label: 'Add diagram', note: 'A slot can hold several diagrams, each with its own title (e.g. CI flow and CD flow).' },
  upload: { label: 'Upload file', note: "PMO's rules: Word, Excel, PowerPoint, PDF, PNG, JPG, Visio, draw.io; no SVG or ZIP; up to 25 MB; malware scan when deployed. Frozen with the version." },
}

function Toolbar({ actions, onNote }: { actions: Action[]; onNote: (action: Action) => void }) {
  if (actions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button key={action.label} variant="secondary" onClick={() => onNote(action)}>
          {action.label}
        </Button>
      ))}
    </div>
  )
}

function Note({ action, onClose }: { action: Action | null; onClose: () => void }) {
  if (!action) return null
  return (
    <PageMessage
      title={`${action.label} (in the build)`}
      action={
        <Button variant="tertiary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {action.note}
    </PageMessage>
  )
}

// ----- Canvas and details panel

type Sizing = 'auto' | 'manual'

const SIZING_OPTIONS: { value: Sizing; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'manual', label: 'By hand' },
]

function Canvas({
  diagram,
  readOnly = false,
  lockBoxes = false,
  sizingSwitch = true,
  dimmed,
  height = 600,
  selected,
  onSelect,
}: {
  diagram: Diagram
  readOnly?: boolean
  /** Boxes and zones cannot be moved or resized here (they are edited in another section). */
  lockBoxes?: boolean
  /** Show the Automatic / By hand zone-size switch (editable diagrams with zones). */
  sizingSwitch?: boolean
  dimmed?: Set<string>
  height?: number
  selected: string
  onSelect: (id: string) => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(diagram.nodes)
  const [sizing, setSizing] = useState<Sizing>(diagram.sizing ?? 'auto')
  const latest = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n.data])), [diagram.nodes])
  const parents = useMemo(() => new Set(nodes.map((n) => n.parentId)), [nodes])
  const zoneIds = useMemo(() => new Set(nodes.filter((n) => n.type === 'zone').map((n) => n.id)), [nodes])
  // Automatic: every zone is sized from its contents, worked out again whenever a box moves.
  const layout = useMemo(() => (sizing === 'auto' ? fitLayout(nodes) : null), [nodes, sizing])
  const fitted = layout?.sizes
  const hasZones = nodes.some((n) => n.type === 'zone')
  const shownNodes = useMemo(
    () =>
      nodes.map((n) => {
        let data = latest.get(n.id) ?? n.data
        if (dimmed?.has(n.id)) data = { ...data, dimmed: true }
        if (n.type === 'zone') data = { ...data, empty: !parents.has(n.id), resizable: sizing === 'manual' && !readOnly && !lockBoxes }
        const size = fitted?.get(n.id)
        const moved = layout?.positions.get(n.id)
        return {
          ...n,
          data,
          selected: n.id === selected,
          ...(size ? { width: size[0], height: size[1] } : {}),
          ...(moved ? { position: moved } : {}),
          // Automatic: a box may be dragged past its zone's right or bottom edge, and the zone grows to follow it.
          ...(sizing === 'auto' && n.parentId && zoneIds.has(n.parentId) ? { extent: [[8, 30], [1e6, 1e6]] as [[number, number], [number, number]] } : {}),
        }
      }),
    [nodes, latest, dimmed, parents, zoneIds, sizing, fitted, layout, selected, readOnly, lockBoxes],
  )
  const shownEdges = useMemo(() => diagram.edges.map((e) => ({ ...e, selected: e.id === selected })), [diagram.edges, selected])
  const changeSizing = (next: Sizing) => {
    // By hand starts from the sizes the zones have now.
    if (next === 'manual' && layout) {
      setNodes((current) =>
        current.map((n) => {
          const size = layout.sizes.get(n.id)
          return { ...n, ...(size ? { width: size[0], height: size[1] } : {}), position: layout.positions.get(n.id) ?? n.position }
        }),
      )
    }
    setSizing(next)
  }
  return (
    <SelectContext value={onSelect}>
      <div className="flex flex-col gap-2">
        {sizingSwitch && !readOnly && !lockBoxes && hasZones && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">Zone sizes</span>
            <Choice label="Zone sizes" options={SIZING_OPTIONS} value={sizing} onChange={changeSizing} />
            <span className="text-xs text-text-subdued">
              {sizing === 'auto'
                ? 'Zones fit their contents and grow as boxes move outwards; empty zones shrink to their name.'
                : "Select a zone and drag its corners. Sizes stay as you set them."}
            </span>
          </div>
        )}
        <div className="rounded-card border border-divider-default" style={{ height: `min(${height}px, 60vh)` }}>
          <ReactFlow
            aria-label={`${diagram.title} canvas`}
            nodes={shownNodes}
            edges={shownEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => onSelect(node.id)}
            onEdgeClick={(_, edge) => onSelect(edge.id)}
            onPaneClick={() => onSelect('')}
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={!readOnly && !lockBoxes}
            nodesConnectable={false}
            elevateNodesOnSelect={false}
            fitView
            fitViewOptions={{ padding: 0.04 }}
            minZoom={0.2}
            colorMode="system"
          >
            <Background gap={16} />
            <Controls showInteractive={false} position="top-right" />
          </ReactFlow>
        </div>
      </div>
    </SelectContext>
  )
}

type AnyData = { label?: string; sub?: string; kind?: string; facts?: Facts; lines?: string[]; todo?: string[]; change?: Change }

function labelOf(diagram: Diagram, id: string): string {
  return (diagram.nodes.find((n) => n.id === id)?.data as AnyData | undefined)?.label ?? id
}

function Details({ diagram, selected }: { diagram: Diagram; selected: string }) {
  const node = diagram.nodes.find((n) => n.id === selected)
  const edge = diagram.edges.find((e) => e.id === selected)
  if (!node && !edge) {
    return <p className="text-sm text-text-subdued">Select a box or a connection, on the canvas or in the tables, to see its details.</p>
  }
  const data = (node?.data ?? edge?.data) as AnyData
  const heading = node ? data.label : `${labelOf(diagram, edge!.source)} → ${labelOf(diagram, edge!.target)}`
  const facts: Facts = data.facts ?? (node ? ([['Type', data.sub ?? data.kind ?? '']] as Facts) : ([['Label', (data.lines ?? []).join(' · ') || 'No label']] as Facts))
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{heading}</h3>
      {data.todo && data.todo.length > 0 && (
        <PageMessage variant="warning" title="Needed before submit">
          {data.todo.join(', ')}
        </PageMessage>
      )}
      <dl className="flex flex-col gap-2">
        {facts.map(([label, value]) => (
          <Fact key={label} label={label}>
            {value === 'Missing' ? <Missing /> : value}
          </Fact>
        ))}
      </dl>
    </div>
  )
}

function Missing({ text = 'Missing' }: { text?: string }) {
  return <span className="font-semibold text-text-error">{text}</span>
}

function CanvasWithDetails({
  extra,
  ...props
}: {
  diagram: Diagram
  readOnly?: boolean
  lockBoxes?: boolean
  sizingSwitch?: boolean
  dimmed?: Set<string>
  selected: string
  onSelect: (id: string) => void
  extra?: (selected: string, diagramId: string) => ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-2">
        <Canvas key={`${props.diagram.id}-${props.diagram.revision ?? 0}`} {...props} />
        <p className="text-xs text-text-subdued">
          Drag boxes to move them; scroll or use + and − to zoom. Thick left edge: part of CRM · round: people · dashed box: external party · dashed line: replication or
          failover · amber: facts missing.
        </p>
      </div>
      <aside aria-label="Details" className="rounded-card border border-divider-default p-4">
        <Details diagram={props.diagram} selected={props.selected} />
        {extra?.(props.selected, props.diagram.id)}
      </aside>
    </div>
  )
}

function SelectButton({ id, children, onSelect }: { id: string; children: ReactNode; onSelect: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onSelect(id)} className="text-left font-semibold text-text-link underline-offset-4 hover:underline">
      {children}
    </button>
  )
}

// ----- Uploads under each diagram

const SAMPLE_UPLOADS = [
  { id: 'u1', name: 'crm-integration-v3.drawio', kind: 'draw.io', size: '84 KB', by: 'Aisyah Rahman', at: '2026-10-20' },
  { id: 'u2', name: 'CRM firewall rules.xlsx', kind: 'Excel', size: '31 KB', by: 'Daniel Lim', at: '2026-10-21' },
]

function Uploads({ onNote, files }: { onNote: (action: Action) => void; files: typeof SAMPLE_UPLOADS }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Supporting files</h3>
        <Button variant="secondary" onClick={() => onNote(ACTIONS.upload)}>
          Upload file
        </Button>
      </div>
      <DataTable
        caption="Supporting files"
        hideCaption
        getRowId={(row) => row.id}
        rows={files}
        emptyState={<p className="p-4 text-sm text-text-subdued">No files yet.</p>}
        columns={[
          { id: 'name', header: 'File', accessor: (row) => row.name, cell: (row) => <span className="font-semibold text-text-link">{row.name}</span> },
          { id: 'kind', header: 'Type', accessor: (row) => row.kind },
          { id: 'size', header: 'Size', accessor: (row) => row.size },
          { id: 'by', header: 'Uploaded by', accessor: (row) => row.by },
          { id: 'at', header: 'Date', accessor: (row) => row.at },
        ]}
      />
    </div>
  )
}

// ----- Generic editor (solution, infrastructure, process flows, monitoring)

/** On Non-production after a copy, servers linked to TRM become typed text: the author links the right servers. */
function unlinkServers(nodes: Node[]): Node[] {
  return nodes.map((node) => {
    const data = node.data as AnyData
    if (!data.facts?.some(([label]) => label === 'TRM server')) return node
    return {
      ...node,
      data: {
        ...data,
        sub: (data.sub ?? '').replace('TRM server', 'typed, not linked'),
        facts: data.facts.map(([label, value]) => (label === 'TRM server' ? [label, 'Not linked: copied as text. Link the right server.'] : [label, value])),
      },
    }
  })
}

/** Copy from production: shown on the target tab; asks first when the target already has boxes or connections. */
interface CopyFrom {
  sourceId: string
  targetId: string
  onCopy: () => void
}

function GenericEditor({
  diagrams,
  actions,
  readOnly = false,
  lockBoxes = false,
  fixedTabs = false,
  extra,
  copyFrom,
  edgeColumns,
}: {
  diagrams: Diagram[]
  actions: Action[]
  readOnly?: boolean
  lockBoxes?: boolean
  /** Columns of the connections table (e.g. integration facts); default: label and line style */
  edgeColumns?: (diagram: Diagram, onSelect: (id: string) => void) => DataTableColumn<Edge>[]
  /** The slot's diagrams are fixed tabs (infrastructure: Production and Non-production); no Add diagram. */
  fixedTabs?: boolean
  extra?: (selected: string, diagramId: string) => ReactNode
  copyFrom?: CopyFrom
}) {
  const [current, setCurrent] = useState(diagrams[0].id)
  const [selected, setSelected] = useState('')
  const [note, setNote] = useState<Action | null>(null)
  const [renamed, setRenamed] = useState<Record<string, Record<string, string>>>({})
  const [copyState, setCopyState] = useState<'idle' | 'confirm' | 'done'>('idle')
  const withNames = (d: Diagram): Diagram => {
    const names = renamed[d.id]
    return names ? { ...d, nodes: d.nodes.map((n) => (names[n.id] !== undefined ? { ...n, data: { ...n.data, label: names[n.id] } } : n)) } : d
  }
  const all = diagrams.map(withNames)
  const diagram = all.find((d) => d.id === current) ?? all[0]
  const parentOf = (node: Node) => (node.parentId ? labelOf(diagram, node.parentId) : '')
  const boxes = diagram.nodes.filter((n) => n.type === 'box' || n.type === 'step')
  const onCopyTab = Boolean(copyFrom && !readOnly && diagram.id === copyFrom.targetId)

  const copy = () => {
    if (!copyFrom) return
    setRenamed({ ...renamed, [copyFrom.targetId]: { ...renamed[copyFrom.sourceId] } })
    copyFrom.onCopy()
    setSelected('')
    setCopyState('done')
  }
  const startCopy = () => {
    const hasContent = diagram.nodes.some((n) => n.type !== 'zone') || diagram.edges.length > 0
    if (hasContent) setCopyState('confirm')
    else copy()
  }
  const rename = (sel: string, diagramId: string) => {
    const node = all.find((d) => d.id === diagramId)?.nodes.find((n) => n.id === sel)
    if (readOnly || lockBoxes || !node || node.type === 'lane') return null
    return (
      <div className="mt-4 border-t border-divider-default pt-4">
        <TextField
          key={`${diagramId}-${sel}`}
          label="Name"
          value={(node.data as AnyData).label ?? ''}
          onChange={(event) => setRenamed({ ...renamed, [diagramId]: { ...renamed[diagramId], [sel]: event.target.value } })}
        />
      </div>
    )
  }
  const sourceTitle = diagrams.find((d) => d.id === copyFrom?.sourceId)?.title ?? ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Choice
          label="Diagrams in this slot"
          options={all.map((d) => ({ value: d.id, label: d.title }))}
          value={diagram.id}
          onChange={(value) => {
            setCurrent(value)
            setSelected('')
            setCopyState('idle')
          }}
        />
        {!readOnly && !fixedTabs && (
          <Button variant="tertiary" onClick={() => setNote(ACTIONS.diagram)}>
            + Add diagram
          </Button>
        )}
        {onCopyTab && copyState !== 'confirm' && (
          <Button variant="secondary" onClick={startCopy}>
            Copy from {sourceTitle.toLowerCase()}
          </Button>
        )}
      </div>
      {onCopyTab && copyState === 'confirm' && (
        <PageMessage variant="warning" title={`Replace everything on ${diagram.title} with a copy of ${sourceTitle}?`}>
          <p>Its boxes, connections and names changed for this diagram are replaced. Its uploads stay.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={copy}>Replace with a copy</Button>
            <Button variant="tertiary" onClick={() => setCopyState('idle')}>
              Cancel
            </Button>
          </div>
        </PageMessage>
      )}
      {onCopyTab && copyState === 'done' && (
        <PageMessage variant="success" title={`Copied from ${sourceTitle}`}>
          {diagram.title} is now an independent copy: edit its text and objects here. Servers linked to TRM were copied as typed text, so link the right servers;
          uploads were not copied.
        </PageMessage>
      )}
      <Toolbar actions={actions} onNote={setNote} />
      <Note action={note} onClose={() => setNote(null)} />
      <CanvasWithDetails diagram={diagram} readOnly={readOnly} lockBoxes={lockBoxes} selected={selected} onSelect={setSelected} extra={(sel, id) => extra?.(sel, id) ?? rename(sel, id)} />
      <div className="grid grid-cols-1 gap-6">
        <DataTable
          caption={diagram.nodes.some((n) => n.type === 'step') ? 'Steps' : 'Boxes'}
          getRowId={(row) => row.id}
          rows={boxes}
          columns={[
            { id: 'name', header: 'Name', accessor: (row) => labelOf(diagram, row.id), cell: (row) => <SelectButton id={row.id} onSelect={setSelected}>{labelOf(diagram, row.id)}</SelectButton>, sortable: true },
            { id: 'type', header: 'Type', accessor: (row) => (row.data as AnyData).sub ?? ((row.data as { shape?: string }).shape === 'decision' ? 'Decision' : 'Step') },
            { id: 'in', header: diagram.nodes.some((n) => n.type === 'lane') ? 'Lane' : 'Zone or group', accessor: parentOf },
          ]}
        />
        <DataTable
          caption="Connections"
          getRowId={(row) => row.id}
          rows={diagram.edges}
          columns={
            edgeColumns
              ? edgeColumns(diagram, setSelected)
              : [
            {
              id: 'conn',
              header: 'Connection',
              accessor: (row) => `${labelOf(diagram, row.source)} → ${labelOf(diagram, row.target)}`,
              cell: (row) => (
                <SelectButton id={row.id} onSelect={setSelected}>
                  {labelOf(diagram, row.source)} → {labelOf(diagram, row.target)}
                </SelectButton>
              ),
            },
            { id: 'label', header: 'Label', accessor: (row) => (row.data as FactData).lines.join(' · ') },
            { id: 'line', header: 'Line', accessor: (row) => ((row.data as FactData).dashed ? 'Dashed (replication or failover)' : 'Solid') },
                ]
          }
        />
      </div>
      {!readOnly && <Uploads onNote={setNote} files={copyFrom && diagram.id === copyFrom.targetId ? [] : SAMPLE_UPLOADS} />}
    </div>
  )
}

const FIELDS: HostingField[] = ['subscription', 'primaryRegion', 'drRegion', 'primaryDc', 'drDc', 'officeNetwork']
const isRegion = (field: HostingField) => field === 'primaryRegion' || field === 'drRegion'

function hostingError(values: Hosting, field: HostingField): string | undefined {
  if (!values[field].trim()) return 'Enter a name'
  if (field === 'drRegion' && values.drRegion === values.primaryRegion) return 'Must differ from the primary region'
  if (field === 'drDc' && values.drDc.trim() === values.primaryDc.trim()) return 'Must differ from the primary data centre'
  return undefined
}

function NameField({ field, value, error, onChange, label = HOSTING_LABEL[field] }: { field: HostingField; value: string; error?: string; onChange: (value: string) => void; label?: string }) {
  if (isRegion(field)) {
    return <Dropdown label={label} options={AZURE_REGIONS.map((region) => ({ value: region, label: region }))} value={value} onValueChange={onChange} error={error} />
  }
  return <TextField label={label} value={value} onChange={(event) => onChange(event.target.value)} error={error} />
}

function HostingFields({ values, onChange, idPrefix }: { values: Hosting; onChange: (values: Hosting) => void; idPrefix: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {FIELDS.map((field) => (
        <NameField key={`${idPrefix}-${field}`} field={field} value={values[field]} error={hostingError(values, field)} onChange={(value) => onChange({ ...values, [field]: value })} />
      ))}
    </div>
  )
}

// ----- Infrastructure diagram: Infrastructure view (section 3) and Integration view (section 2)

type InfraView = 'infra' | 'integration'

interface InfraState {
  hosting: Hosting
  setHosting: (hosting: Hosting) => void
  /** Names changed on one diagram only, by diagram id */
  changed: Record<string, Partial<Hosting>>
  setChanged: (changed: Record<string, Partial<Hosting>>) => void
  /** How many times Non-production was replaced with a copy of Production (0: never) */
  copied: number
  setCopied: (copied: number) => void
}

/** Production and Non-production, with the names each one uses. */
function infraDiagrams({ hosting, changed, copied }: InfraState): { production: Diagram; nonProduction: Diagram } {
  const names = (id: string) => ({ ...hosting, ...changed[id] })
  const flags = (id: string) => Object.fromEntries(Object.keys(changed[id] ?? {}).map((k) => [k, true]))
  const production = infrastructureDiagram(names('infrastructure'), flags('infrastructure'))
  const nonProduction: Diagram = copied
    ? (() => {
        const copy = infrastructureDiagram(names('non-production'), flags('non-production'))
        return { ...copy, id: 'non-production', title: 'Non-production', revision: copied, nodes: unlinkServers(copy.nodes) }
      })()
    : nonProductionDiagram(names('non-production'), flags('non-production'))
  return { production, nonProduction }
}

const layerOf = (e: Edge) => (e.data as FactData | undefined)?.layer ?? 'infra'
const onlyLayer = (diagram: Diagram, layer: InfraView): Diagram => ({ ...diagram, edges: diagram.edges.filter((e) => layerOf(e) === layer) })

/** "Southeast Asia › snet-app": the zones a box sits in, below the subscription. */
function zonePath(diagram: Diagram, id: string): string {
  const path: string[] = []
  let node = diagram.nodes.find((n) => n.id === diagram.nodes.find((x) => x.id === id)?.parentId)
  while (node) {
    if (node.id !== 'my01') path.unshift((node.data as AnyData).label ?? '')
    node = diagram.nodes.find((n) => n.id === node!.parentId)
  }
  return path.join(' › ') || '—'
}

const row = (e: Edge) => (e.data as FactData).row ?? {}

function integrationColumns(diagram: Diagram, onSelect: (id: string) => void): DataTableColumn<Edge>[] {
  const missing = (value: string | undefined) => (value ? value : <Missing />)
  return [
    {
      id: 'conn',
      header: 'Connection',
      accessor: (e) => `${labelOf(diagram, e.source)} → ${labelOf(diagram, e.target)}`,
      cell: (e) => (
        <SelectButton id={e.id} onSelect={onSelect}>
          {labelOf(diagram, e.source)} → {labelOf(diagram, e.target)}
        </SelectButton>
      ),
    },
    { id: 'protocol', header: 'Protocol and port', accessor: (e) => `${row(e).protocol} ${row(e).port}` },
    { id: 'tls', header: 'TLS', accessor: (e) => row(e).tls },
    { id: 'direction', header: 'Direction', accessor: (e) => row(e).direction },
    { id: 'pattern', header: 'Pattern', accessor: (e) => row(e).pattern },
    { id: 'auth', header: 'Authentication', accessor: (e) => row(e).authentication, cell: (e) => missing(row(e).authentication) },
    { id: 'api', header: 'API (inventory)', accessor: (e) => row(e).api, cell: (e) => missing(row(e).api) },
    { id: 'class', header: 'Classification', accessor: (e) => row(e).classification },
    { id: 'purpose', header: 'Purpose', accessor: (e) => row(e).purpose },
    { id: 'flow', header: 'Flow type', accessor: (e) => row(e).flow },
  ]
}

function InfraEditor({ infra, view, readOnly = false }: { infra: InfraState; view: InfraView; readOnly?: boolean }) {
  const { hosting, setHosting, changed, setChanged, copied, setCopied } = infra
  const { production, nonProduction } = infraDiagrams(infra)
  const diagrams = [production, nonProduction].map((d) => onlyLayer(d, view))
  const incomplete = view === 'integration' ? diagrams.flatMap((d) => d.edges.filter((e) => ((e.data as FactData).todo ?? []).length > 0).map((e) => ({ d, e }))) : []
  const copyFrom: CopyFrom | undefined =
    view === 'infra' && !readOnly
      ? {
          sourceId: 'infrastructure',
          targetId: 'non-production',
          onCopy: () => {
            setChanged({ ...changed, 'non-production': { ...changed.infrastructure } })
            setCopied(copied + 1)
          },
        }
      : undefined
  const extra = (selected: string, diagramId: string) => {
    const field = ZONE_FIELD[selected]
    if (!field || readOnly || view === 'integration') return null
    const mine = changed[diagramId] ?? {}
    const names = { ...hosting, ...mine }
    const own = mine[field]
    const update = (next: Partial<Hosting>) => setChanged({ ...changed, [diagramId]: next })
    return (
      <div className="mt-4 flex flex-col gap-3 border-t border-divider-default pt-4">
        {own === undefined ? (
          <>
            <p className="text-sm">
              Follows this application&apos;s hosting setting ({HOSTING_LABEL[field].toLowerCase()}: <strong>{hosting[field]}</strong>).
            </p>
            <Button variant="secondary" onClick={() => update({ ...mine, [field]: hosting[field] })}>
              Change for this diagram
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">Changed for this diagram</p>
            <NameField field={field} label={`${HOSTING_LABEL[field]} on this diagram`} value={own} error={hostingError(names, field)} onChange={(value) => update({ ...mine, [field]: value })} />
            <Button
              variant="tertiary"
              onClick={() => {
                const rest = { ...mine }
                delete rest[field]
                update(rest)
              }}
            >
              Use the application setting ({hosting[field]})
            </Button>
          </>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {view === 'infra' && !readOnly && (
        <section aria-labelledby="hosting-title" className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
          <div>
            <h3 id="hosting-title" className="text-base font-semibold">
              Hosting for this application
            </h3>
            <p className="text-sm text-text-subdued">
              Filled from the admin defaults when this application&apos;s hosting was set up. Every infrastructure diagram follows these names; select a subscription, region,
              data centre or office network on a diagram to change it for that diagram only.
            </p>
          </div>
          <HostingFields values={hosting} onChange={setHosting} idPrefix="app" />
        </section>
      )}
      {view === 'integration' && (
        <PageMessage>
          Section 2 editors add and change the integration connections and their facts. Zones and boxes come from section 3&apos;s infrastructure view and cannot be moved
          here; other applications and external parties can be added by section 2 or section 3 editors.
        </PageMessage>
      )}
      {incomplete.length > 0 && (
        <PageMessage variant="warning" title="Submit is blocked until every integration connection has its facts">
          {incomplete.map(({ d, e }) => `${d.title}: ${labelOf(d, e.source)} → ${labelOf(d, e.target)}: ${((e.data as FactData).todo ?? []).join(', ')}`).join('; ')}
        </PageMessage>
      )}
      <GenericEditor
        diagrams={diagrams}
        actions={readOnly ? [] : view === 'infra' ? [ACTIONS.azure, ACTIONS.server, ACTIONS.personDevice, ACTIONS.otherApp, ACTIONS.infraLine, ACTIONS.azureZone, ACTIONS.drawio] : [ACTIONS.integrationConnection, ACTIONS.otherApp]}
        readOnly={readOnly}
        lockBoxes={view === 'integration'}
        fixedTabs
        extra={extra}
        copyFrom={copyFrom}
        edgeColumns={view === 'integration' ? integrationColumns : undefined}
      />
    </div>
  )
}

// ----- Solution diagram: Solution view (section 2) and Data flow view (section 9)

const VIEW_OPTIONS: { value: SolutionView; label: string }[] = [
  { value: 'solution', label: 'Solution' },
  { value: 'data', label: 'Data flow' },
]
const BLOCK_TYPES: BlockType[] = ['actor', 'part', 'business', 'external']

function nextSpot(blocks: Block[], type: BlockType): { x: number; y: number } {
  const column = blocks.filter((b) => (type === 'part' ? b.type === 'part' : type === 'actor' ? b.type === 'actor' : b.type === 'business' || b.type === 'external') && b.x > 100 === (type !== 'actor'))
  const lowest = Math.max(-120, ...column.map((b) => b.y))
  if (type === 'part') return { x: 20, y: lowest + 110 }
  if (type === 'actor') return { x: 0, y: lowest + 150 }
  return { x: 880, y: lowest + 130 }
}

function AddBlock({ blocks, onAdd, onCancel }: { blocks: Block[]; onAdd: (block: Block) => void; onCancel: () => void }) {
  const [type, setType] = useState<BlockType>('business')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<TrmApp | null>(null)
  const query = name.trim().toLowerCase()
  const matches = TRM_APPS.filter((app) => `${app.apm} ${app.name}`.toLowerCase().includes(query)).slice(0, 6)
  const add = (trm?: TrmApp) => {
    const label = trm ? trm.name : name.trim()
    if (!label) return
    onAdd({ id: `b${blocks.length + 1}`, name: label, type, ...nextSpot(blocks, type), ...(trm ? { trm } : {}) })
  }
  return (
    <section aria-labelledby="add-block-title" className="flex flex-col gap-3 rounded-card border border-border-selected p-4">
      <h3 id="add-block-title" className="text-base font-semibold">
        Add block
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Dropdown
          label="Type"
          options={BLOCK_TYPES.map((t) => ({ value: t, label: BLOCK_TYPE_LABEL[t] }))}
          value={type}
          onValueChange={(next) => {
            setType(next)
            setPicked(null)
          }}
        />
        <TextField
          label={type === 'business' ? 'Business application' : 'Name'}
          hint={type === 'business' ? 'Search TRM by name or APM number; type the name if it is not in TRM.' : undefined}
          value={picked ? `${picked.apm} ${picked.name}` : name}
          onChange={(event) => {
            setPicked(null)
            setName(event.target.value)
          }}
        />
      </div>
      {type === 'business' && !picked && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">From TRM</p>
          <ul className="flex flex-wrap gap-2">
            {matches.map((app) => (
              <li key={app.apm}>
                <Button variant="secondary" onClick={() => setPicked(app)}>
                  {app.apm} {app.name}
                </Button>
              </li>
            ))}
            {matches.length === 0 && <li className="text-sm text-text-subdued">No TRM application matches.</li>}
          </ul>
        </div>
      )}
      {type === 'business' && picked && <p className="text-sm">Picked from TRM: it maps back to {picked.name}&apos;s connections.</p>}
      <div className="flex flex-wrap gap-2">
        {type === 'business' ? (
          picked ? (
            <Button onClick={() => add(picked)}>Add {picked.name}</Button>
          ) : (
            <Button variant="secondary" disabled={!name.trim()} onClick={() => add()}>
              {name.trim() ? `Add "${name.trim()}" as typed (not in TRM, not mapped)` : 'Type a name to add it as typed'}
            </Button>
          )
        ) : (
          <Button disabled={!name.trim()} onClick={() => add()}>
            Add {BLOCK_TYPE_LABEL[type].toLowerCase()}
          </Button>
        )}
        <Button variant="tertiary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

function AddConnection({ blocks, onAdd, onCancel }: { blocks: Block[]; onAdd: (link: Omit<Link, 'id'>) => void; onCancel: () => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [calls, setCalls] = useState('')
  const [does, setDoes] = useState('')
  const [direction, setDirection] = useState<Link['direction']>('One-way')
  const options = blocks.map((b) => ({ value: b.id, label: b.name }))
  return (
    <section aria-labelledby="add-conn-title" className="flex flex-col gap-3 rounded-card border border-border-selected p-4">
      <h3 id="add-conn-title" className="text-base font-semibold">
        Add connection
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Dropdown label="From" placeholder="Choose a block" options={options} value={from || null} onValueChange={setFrom} />
        <Dropdown label="To" placeholder="Choose a block" options={options} value={to || null} onValueChange={setTo} error={from && from === to ? 'Choose a different block' : undefined} />
        <TextField label="What it calls" hint='e.g. "Policy API: create policy" or "nightly file"' value={calls} onChange={(event) => setCalls(event.target.value)} />
        <TextField label="What it does" hint="A short purpose" value={does} onChange={(event) => setDoes(event.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Direction</span>
        <Choice
          label="Direction"
          options={[
            { value: 'One-way', label: 'One-way' },
            { value: 'Two-way', label: 'Two-way' },
          ]}
          value={direction}
          onChange={setDirection}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!from || !to || from === to} onClick={() => onAdd({ from, to, calls, does, direction, data: '', classification: '', frequency: '' })}>
          Add connection
        </Button>
        <Button variant="tertiary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

function SolutionEditor({ solution, setSolution, initialView, section9 = false }: { solution: Solution; setSolution: (solution: Solution) => void; initialView: SolutionView; section9?: boolean }) {
  const [view, setView] = useState<SolutionView>(initialView)
  const [hideCalls, setHideCalls] = useState(false)
  const [selected, setSelected] = useState('')
  const [note, setNote] = useState<Action | null>(null)
  const [form, setForm] = useState<'block' | 'connection' | null>(null)
  const [revision, setRevision] = useState(0)
  const shownView = hideCalls ? 'data' : view
  const diagram = { ...solutionDiagram(solution, shownView, { hideCalls }), revision }
  const name = (id: string) => solution.blocks.find((b) => b.id === id)?.name ?? id
  const blocked = shownView === 'data' ? solution.links.filter((l) => dataTodo(l).length > 0) : []
  const undescribed = shownView === 'solution' ? solution.links.filter((l) => solutionTodo(l).length > 0) : []
  const noData = shownView === 'data' ? solution.links.filter((l) => !l.data.trim()) : []
  const updateLink = (id: string, patch: Partial<Link>) => setSolution({ ...solution, links: solution.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  const updateBlock = (id: string, patch: Partial<Block>) => setSolution({ ...solution, blocks: solution.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })

  // Details panel: section 2 edits blocks and what a connection calls/does; section 9 edits the data-flow facts.
  const editor = (sel: string) => {
    const link = solution.links.find((l) => l.id === sel)
    const block = solution.blocks.find((b) => b.id === sel)
    if (link && !section9 && shownView === 'solution') {
      return (
        <div className="mt-4 flex flex-col gap-3 border-t border-divider-default pt-4">
          <TextField key={`${sel}-calls`} label="What it calls" value={link.calls} onChange={(event) => updateLink(sel, { calls: event.target.value })} />
          <TextField key={`${sel}-does`} label="What it does" value={link.does} onChange={(event) => updateLink(sel, { does: event.target.value })} />
          <Choice
            label="Direction"
            options={[
              { value: 'One-way', label: 'One-way' },
              { value: 'Two-way', label: 'Two-way' },
            ]}
            value={link.direction}
            onChange={(direction) => updateLink(sel, { direction })}
          />
        </div>
      )
    }
    if (link && section9 && shownView === 'data') {
      return (
        <div className="mt-4 flex flex-col gap-3 border-t border-divider-default pt-4">
          <Textarea key={`${sel}-data`} label="Data objects and key attributes" hint="One per line, e.g. Customer: name, IC no., email" rows={3} value={link.data} onChange={(event) => updateLink(sel, { data: event.target.value })} />
          <Dropdown<Classification>
            label="Classification"
            placeholder="Choose"
            options={CLASSIFICATIONS.map((c) => ({ value: c, label: c }))}
            value={link.classification || null}
            onValueChange={(classification) => updateLink(sel, { classification })}
            error={link.data.trim() && !link.classification ? 'Required when data objects are recorded' : undefined}
          />
          <TextField
            key={`${sel}-freq`}
            label="Frequency / volume"
            hint="e.g. Real time, ~500 a day; Nightly batch"
            value={link.frequency}
            onChange={(event) => updateLink(sel, { frequency: event.target.value })}
            error={link.data.trim() && !link.frequency.trim() ? 'Required when data objects are recorded' : undefined}
          />
        </div>
      )
    }
    if (block && !section9) {
      return (
        <div className="mt-4 border-t border-divider-default pt-4">
          <TextField key={`${sel}-name`} label="Name" value={block.name} onChange={(event) => updateBlock(sel, { name: event.target.value })} />
        </div>
      )
    }
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      {section9 && (
        <PageMessage>
          Section 9 editors record the data objects, classification and frequency / volume on each connection (select a connection). Blocks and what a connection calls
          or does are edited in section 2.
        </PageMessage>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {!hideCalls && <Choice label="View" options={VIEW_OPTIONS} value={view} onChange={setView} />}
        {section9 && <Checkbox label="Preview as a section 9 reader without section 2 access" checked={hideCalls} onCheckedChange={setHideCalls} />}
      </div>
      {!section9 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setForm('block')}>
            Add block
          </Button>
          <Button variant="secondary" onClick={() => setForm('connection')}>
            Add connection
          </Button>
          <Button variant="secondary" onClick={() => setNote(ACTIONS.group)}>
            {ACTIONS.group.label}
          </Button>
          <Button variant="secondary" onClick={() => setNote(ACTIONS.drawio)}>
            {ACTIONS.drawio.label}
          </Button>
        </div>
      )}
      <Note action={note} onClose={() => setNote(null)} />
      {form === 'block' && (
        <AddBlock
          blocks={solution.blocks}
          onCancel={() => setForm(null)}
          onAdd={(block) => {
            setSolution({ ...solution, blocks: [...solution.blocks, block] })
            setRevision(revision + 1)
            setSelected(block.id)
            setForm(null)
          }}
        />
      )}
      {form === 'connection' && (
        <AddConnection
          blocks={solution.blocks}
          onCancel={() => setForm(null)}
          onAdd={(link) => {
            const id = `l${solution.links.length + 1}`
            setSolution({ ...solution, links: [...solution.links, { id, ...link }] })
            setSelected(id)
            setForm(null)
          }}
        />
      )}
      {undescribed.length > 0 && (
        <PageMessage variant="warning" title="Submit is blocked until every connection says what it calls and what it does">
          {undescribed.map((l) => `${name(l.from)} → ${name(l.to)}: ${solutionTodo(l).join(', ')}`).join('; ')}
        </PageMessage>
      )}
      {blocked.length > 0 && (
        <PageMessage variant="warning" title="Submit is blocked: connections with data objects need classification and frequency / volume">
          {blocked.map((l) => `${name(l.from)} → ${name(l.to)}: ${dataTodo(l).join(', ')}`).join('; ')}
        </PageMessage>
      )}
      {noData.length > 0 && (
        <PageMessage title="Connections without data objects">
          Data objects are optional; these connections have none: {noData.map((l) => `${name(l.from)} → ${name(l.to)}`).join('; ')}.
        </PageMessage>
      )}
      <CanvasWithDetails diagram={diagram} readOnly={section9} selected={selected} onSelect={setSelected} extra={(sel) => editor(sel)} />
      <DataTable<Block>
        caption="Blocks"
        getRowId={(b) => b.id}
        rows={solution.blocks}
        columns={[
          { id: 'name', header: 'Name', accessor: (b) => b.name, cell: (b) => <SelectButton id={b.id} onSelect={setSelected}>{b.name}</SelectButton>, sortable: true },
          { id: 'type', header: 'Type', accessor: (b) => BLOCK_TYPE_LABEL[b.type], sortable: true },
          { id: 'trm', header: 'TRM application', accessor: (b) => (b.type === 'business' ? (b.trm ? `${b.trm.apm} ${b.trm.name}` : 'Typed, not in TRM') : '—'), cell: (b) => (b.type === 'business' ? blockSub(b).replace('Business application · ', '') : '—') },
        ]}
      />
      <DataTable<Link>
        caption="Connections"
        getRowId={(l) => l.id}
        rows={solution.links}
        columns={[
          {
            id: 'conn',
            header: 'Connection',
            accessor: (l) => `${name(l.from)} → ${name(l.to)}`,
            cell: (l) => (
              <SelectButton id={l.id} onSelect={setSelected}>
                {name(l.from)} → {name(l.to)}
              </SelectButton>
            ),
          },
          ...(shownView === 'solution'
            ? ([
                { id: 'calls', header: 'What it calls', accessor: (l) => l.calls, cell: (l) => l.calls || <Missing /> },
                { id: 'does', header: 'What it does', accessor: (l) => l.does, cell: (l) => l.does || <Missing /> },
              ] as DataTableColumn<Link>[])
            : []),
          ...(hideCalls ? [] : ([{ id: 'dir', header: 'Direction', accessor: (l) => l.direction }] as DataTableColumn<Link>[])),
          ...(shownView === 'data'
            ? ([
                { id: 'data', header: 'Data objects and key attributes', accessor: (l) => l.data, cell: (l) => (l.data.trim() ? l.data.split('\n').join('; ') : <span className="text-text-subdued">None</span>) },
                { id: 'class', header: 'Classification', accessor: (l) => l.classification, cell: (l) => l.classification || (l.data.trim() ? <Missing /> : '—') },
                { id: 'freq', header: 'Frequency / volume', accessor: (l) => l.frequency, cell: (l) => l.frequency || (l.data.trim() ? <Missing /> : '—') },
              ] as DataTableColumn<Link>[])
            : []),
        ]}
      />
      {!section9 && <IncomingCalls />}
      {!section9 && <Uploads onNote={setNote} files={SAMPLE_UPLOADS} />}
    </div>
  )
}

function callColumns(other: 'caller' | 'callee' | 'both'): DataTableColumn<AppCall>[] {
  const app = (c: AppCall) => (other === 'caller' ? c.caller : c.callee)
  return [
    ...(other === 'both'
      ? ([
          { id: 'caller', header: 'Caller', accessor: (c) => c.caller },
          { id: 'callee', header: 'Called', accessor: (c) => c.callee },
        ] as DataTableColumn<AppCall>[])
      : ([{ id: 'app', header: other === 'caller' ? 'Application calling' : 'Application called', accessor: app }] as DataTableColumn<AppCall>[])),
    { id: 'calls', header: 'What it calls', accessor: (c) => c.calls },
    { id: 'does', header: 'What it does', accessor: (c) => c.does },
    { id: 'dir', header: 'Direction', accessor: (c) => c.direction },
    { id: 'from', header: 'From', accessor: (c) => c.source },
  ]
}

/** Other applications' approved SADs that say they call CRM (placement: proposal). */
function IncomingCalls() {
  const rows = APPROVED_CALLS.filter((c) => c.callee === 'APM-0001 CRM')
  return (
    <section aria-labelledby="incoming-title" className="flex flex-col gap-2">
      <h3 id="incoming-title" className="text-base font-semibold">
        Calls from other applications
      </h3>
      <p className="text-sm text-text-subdued">Read-only, from the other applications&apos; latest approved SADs (where this list sits is a proposal).</p>
      <DataTable<AppCall> caption="Calls from other applications" hideCaption getRowId={(c) => c.id} rows={rows} columns={callColumns('caller')} />
    </section>
  )
}

// ----- Communication matrices (section 2, generated)

interface TechRow {
  id: string
  env: string
  source: string
  sourceZone: string
  destination: string
  destinationZone: string
  protocol: string
  port: string
  tls: string
  direction: string
  pattern: string
  authentication: string
  api: string
  classification: string
  purpose: string
  flow: string
}

function Matrices({ infra, solution }: { infra: InfraState; solution: Solution }) {
  const [noSection9, setNoSection9] = useState(false)
  const { production, nonProduction } = infraDiagrams(infra)
  const technical = [
    ...onlyLayer(production, 'integration').edges.map((e) => ({ e, d: production, env: 'Production' })),
    ...onlyLayer(nonProduction, 'integration').edges.map((e) => ({ e, d: nonProduction, env: 'Non-production' })),
  ].map(({ e, d, env }): TechRow => {
    const r = row(e)
    return {
      id: `${env}-${e.id}`,
      env,
      source: labelOf(d, e.source),
      sourceZone: zonePath(d, e.source),
      destination: labelOf(d, e.target),
      destinationZone: zonePath(d, e.target),
      protocol: r.protocol,
      port: r.port,
      tls: r.tls,
      direction: r.direction,
      pattern: r.pattern,
      authentication: r.authentication,
      api: r.api,
      classification: r.classification,
      purpose: r.purpose,
      flow: r.flow,
    }
  })
  const missing = (value: string | undefined) => (value ? value : <Missing />)
  return (
    <div className="flex flex-col gap-6">
      <PageMessage>Generated from the diagrams, read-only: change the diagrams to change these tables. They replace the communication-matrix text answer.</PageMessage>
      <section aria-labelledby="logical-title" className="flex flex-col gap-2">
        <h3 id="logical-title" className="text-base font-semibold">
          Logical matrix: solution diagram and data flow
        </h3>
        <Checkbox label="Preview as a section 2 reader without section 9 access" checked={noSection9} onCheckedChange={setNoSection9} />
        <DataTable<LogicalRow>
          caption="Logical matrix"
          hideCaption
          striped
          getRowId={(r) => r.id}
          rows={logicalRows(solution)}
          columns={[
            { id: 'src', header: 'Source', accessor: (r) => r.source, sortable: true },
            { id: 'dst', header: 'Destination', accessor: (r) => r.destination, sortable: true },
            { id: 'calls', header: 'What it calls', accessor: (r) => r.calls },
            { id: 'does', header: 'What it does', accessor: (r) => r.does },
            { id: 'dir', header: 'Direction', accessor: (r) => r.direction },
            ...(noSection9
              ? []
              : ([
                  { id: 'data', header: 'Data objects and key attributes', accessor: (r) => r.data, cell: (r) => r.data || <span className="text-text-subdued">None</span> },
                  { id: 'class', header: 'Classification', accessor: (r) => r.classification, cell: (r) => r.classification || (r.data ? <Missing /> : '—') },
                  { id: 'freq', header: 'Frequency / volume', accessor: (r) => r.frequency, cell: (r) => r.frequency || (r.data ? <Missing /> : '—') },
                ] as DataTableColumn<LogicalRow>[])),
          ]}
        />
      </section>
      <section aria-labelledby="technical-title" className="flex flex-col gap-2">
        <h3 id="technical-title" className="text-base font-semibold">
          Technical matrix: infrastructure diagram and integration connections
        </h3>
        <DataTable<TechRow>
          caption="Technical matrix"
          hideCaption
          striped
          getRowId={(r) => r.id}
          rows={technical}
          columns={[
            { id: 'env', header: 'Environment', accessor: (r) => r.env, sortable: true },
            { id: 'src', header: 'Source', accessor: (r) => r.source, sortable: true },
            { id: 'srczone', header: 'Source zone', accessor: (r) => r.sourceZone },
            { id: 'dst', header: 'Destination', accessor: (r) => r.destination, sortable: true },
            { id: 'dstzone', header: 'Destination zone', accessor: (r) => r.destinationZone },
            { id: 'protocol', header: 'Protocol', accessor: (r) => r.protocol },
            { id: 'port', header: 'Port', accessor: (r) => r.port },
            { id: 'tls', header: 'TLS', accessor: (r) => r.tls },
            { id: 'dir', header: 'Direction', accessor: (r) => r.direction },
            { id: 'pattern', header: 'Pattern', accessor: (r) => r.pattern },
            { id: 'auth', header: 'Authentication', accessor: (r) => r.authentication, cell: (r) => missing(r.authentication) },
            { id: 'api', header: 'API', accessor: (r) => r.api, cell: (r) => missing(r.api) },
            { id: 'class', header: 'Classification', accessor: (r) => r.classification },
            { id: 'purpose', header: 'Purpose', accessor: (r) => r.purpose },
            { id: 'flow', header: 'Flow type', accessor: (r) => r.flow },
          ]}
        />
      </section>
    </div>
  )
}

// ----- TRM: an application's connections and dependency view (from approved SADs)

const TRM_PICK = ['APM-0002 Policy Admin', 'APM-0001 CRM', 'APM-0005 Customer Portal']

function TrmConnections() {
  const [app, setApp] = useState(TRM_PICK[0])
  const [selected, setSelected] = useState('')
  const callers = APPROVED_CALLS.filter((c) => c.callee === app)
  const callees = APPROVED_CALLS.filter((c) => c.caller === app)
  const diagram = useMemo(() => dependencyDiagram(app), [app])
  return (
    <section aria-labelledby="slot-title" className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-text-subdued">TRM application page · Dependencies tab (also a TRM landscape view: pick the application)</p>
        <h2 id="slot-title" className="heading-4">
          Application connections
        </h2>
        <p className="max-w-4xl text-sm text-text-subdued">
          Built from the solution diagrams in every application&apos;s latest approved SAD. Only business applications picked from TRM appear; typed ones (such as CRM&apos;s
          &quot;Enterprise data warehouse&quot;) and drafts (such as CRM&apos;s SAD v3) are not counted.
        </p>
      </div>
      <div className="max-w-md">
        <Dropdown
          label="Application"
          options={TRM_PICK.map((a) => ({ value: a, label: a }))}
          value={app}
          onValueChange={(next) => {
            setApp(next)
            setSelected('')
          }}
        />
      </div>
      <CanvasWithDetails diagram={diagram} readOnly selected={selected} onSelect={setSelected} />
      <DataTable<AppCall> caption={`Applications calling ${app.split(' ').slice(1).join(' ')} (${callers.length})`} getRowId={(c) => c.id} rows={callers} columns={callColumns('caller')} />
      <DataTable<AppCall> caption={`Applications ${app.split(' ').slice(1).join(' ')} calls (${callees.length})`} getRowId={(c) => c.id} rows={callees} columns={callColumns('callee')} />
    </section>
  )
}

// ----- Version compare (solution diagram)

function Compare({ solution }: { solution: Solution }) {
  const { before, after } = useMemo(() => compareSolutions(solution), [solution])
  const [selected, setSelected] = useState('')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">Legend</span>
        {(['added', 'removed', 'changed'] as Change[]).map((change) => (
          <span key={change} className={cn('rounded-tag border-2 px-2 py-0.5 font-semibold', CHANGE_CLASS[change])}>
            {CHANGE_LABEL[change]}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">v2 · approved 2026-08-14</h3>
          <Canvas key="v2" diagram={before} readOnly height={460} selected={selected} onSelect={setSelected} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">v3 · draft</h3>
          <Canvas key="v3" diagram={after} readOnly height={460} selected={selected} onSelect={setSelected} />
        </div>
      </div>
      <DataTable<ChangeRow>
        caption={`Changes (${CHANGES.length})`}
        getRowId={(r) => r.id}
        rows={CHANGES}
        columns={[
          { id: 'change', header: 'Change', accessor: (r) => CHANGE_LABEL[r.change], cell: (r) => <span className={cn('rounded-tag border-2 px-2 py-0.5 text-xs font-semibold', CHANGE_CLASS[r.change])}>{CHANGE_LABEL[r.change]}</span>, sortable: true },
          { id: 'item', header: 'Item', accessor: (r) => r.item },
          { id: 'before', header: 'v2', accessor: (r) => r.before || '—' },
          { id: 'after', header: 'v3', accessor: (r) => r.after },
        ]}
      />
    </div>
  )
}

// ----- Admin: diagram defaults

function AdminSettings() {
  const [defaults, setDefaults] = useState<Hosting>(ADMIN_DEFAULTS)
  const [note, setNote] = useState<Action | null>(null)
  return (
    <section aria-labelledby="slot-title" className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-text-subdued">Admin settings · needs &quot;Maintain SAD diagram defaults&quot;</p>
        <h2 id="slot-title" className="heading-4">
          Diagram defaults
        </h2>
        <p className="max-w-4xl text-sm text-text-subdued">
          Used when an application&apos;s hosting is set up. Applications already set up keep their own names, so changing a default here does not rename anything on
          existing diagrams (in this prototype, CRM keeps its settings).
        </p>
      </div>
      <HostingFields values={defaults} onChange={setDefaults} idPrefix="defaults" />
      <div>
        <Button onClick={() => setNote({ label: 'Save defaults', note: 'Saves the defaults (audited). Applications set up afterwards start with them.' })}>Save defaults</Button>
      </div>
      <Note action={note} onClose={() => setNote(null)} />
    </section>
  )
}
