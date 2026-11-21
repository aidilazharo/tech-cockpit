import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable, Dropdown, PageMessage, TextField, type DataTableColumn } from '../../../components/qi'
import { WarningIcon } from '../../../components/qi/icons'
import { DATA_CLASSIFICATIONS, FLOW_TYPES, PATTERNS, TLS_VERSIONS, type Diagram, type DiagramApi, type Line } from '../schemas'
import { namesOf, type Change } from './helpers'
import { apiName, tlsText } from './labels'
import { addConnection, missingFacts, nonCompliantTls, updateLine } from './model'
import { FormFrame, Segmented, Suggested } from './parts'

/** The Dropdown needs a value for "not chosen". */
const NONE = '__none__'
const PROTOCOLS = ['HTTPS', 'SFTP', 'TDS', 'AMQP', 'SSH', 'LDAPS', 'SMTP']
const AUTHENTICATIONS = ['OAuth 2.0', 'mTLS', 'API key', 'Managed identity', 'Entra ID SSO', 'SSH key', 'Certificate']

const portOf = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined)
const directions = (t: (key: string) => string) => [
  { value: 'one' as const, label: t('sad.diagram.oneWay') },
  { value: 'two' as const, label: t('sad.diagram.twoWayShort') },
]

/** A new integration connection: between two boxes, with its protocol and port (the other facts in its details). */
export function IntegrationForm({ diagram, onAdd, onCancel }: { diagram: Diagram; onAdd: (line: Parameters<typeof addConnection>[1]) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [protocol, setProtocol] = useState('')
  const [port, setPort] = useState('')
  const [direction, setDirection] = useState<'one' | 'two'>('one')
  const [tried, setTried] = useState(false)
  const boxes = diagram.boxes.map((box) => ({ value: box.id, label: box.label }))
  const same = from !== null && from === to
  return (
    <FormFrame
      title={t('sad.diagram.addConnection')}
      onAdd={() => {
        setTried(true)
        if (from && to && !same) onAdd({ from, to, protocol, port: portOf(port), twoWay: direction === 'two' })
      }}
      onCancel={onCancel}
    >
      <Dropdown label={t('sad.diagram.from')} placeholder={t('sad.diagram.choose')} options={boxes} value={from} onValueChange={setFrom} error={tried && !from ? t('sad.diagram.choose') : undefined} />
      <Dropdown
        label={t('sad.diagram.to')}
        placeholder={t('sad.diagram.choose')}
        options={boxes}
        value={to}
        onValueChange={setTo}
        error={same ? t('sad.diagram.sameEnds') : tried && !to ? t('sad.diagram.choose') : undefined}
      />
      <Suggested label={t('sad.diagram.protocol')} hint={t('sad.diagram.protocolHint')} value={protocol} suggestions={PROTOCOLS} onChange={setProtocol} />
      <TextField label={t('sad.diagram.port')} inputMode="numeric" value={port} onChange={(event) => setPort(event.target.value)} />
      <Segmented label={t('sad.diagram.direction')} options={directions(t)} value={direction} onChange={setDirection} />
    </FormFrame>
  )
}

/** A selected integration connection's facts, each changed as it is chosen or typed. */
export function IntegrationFields({ diagram, line, apis, change }: { diagram: Diagram; line: Line; apis: DiagramApi[]; change: Change }) {
  const { t } = useTranslation()
  const set = (patch: Parameters<typeof updateLine>[2]) => change((d) => updateLine(d, line.id, patch))
  const boxes = diagram.boxes.map((box) => ({ value: box.id, label: box.label }))
  const choice = <V extends string>(label: string, values: readonly V[], value: V | undefined, onChange: (value: V | undefined) => void, optionLabel: (value: V) => string) => (
    <Dropdown
      label={label}
      options={[{ value: NONE, label: t('sad.diagram.notSet') }, ...values.map((option) => ({ value: option, label: optionLabel(option) }))]}
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? undefined : (next as V))}
    />
  )
  return (
    <>
      <Dropdown label={t('sad.diagram.from')} options={boxes.filter((end) => end.value !== line.to)} value={line.from} onValueChange={(from) => set({ from })} />
      <Dropdown label={t('sad.diagram.to')} options={boxes.filter((end) => end.value !== line.from)} value={line.to} onValueChange={(to) => set({ to })} />
      <Suggested label={t('sad.diagram.protocol')} hint={t('sad.diagram.protocolHint')} value={line.protocol ?? ''} suggestions={PROTOCOLS} onChange={(protocol) => set({ protocol })} />
      <TextField key={`${line.id}-port`} label={t('sad.diagram.port')} inputMode="numeric" defaultValue={line.port ?? ''} onChange={(event) => set({ port: portOf(event.target.value) })} />
      {choice(t('sad.diagram.tls'), TLS_VERSIONS, line.tls, (tls) => set({ tls }), (value) => t(`sad.diagram.tlsVersions.${value}`))}
      {line.tls === 'none' && <TextField key={`${line.id}-protection`} label={t('sad.diagram.protection')} hint={t('sad.diagram.protectionHint')} value={line.protection ?? ''} onChange={(event) => set({ protection: event.target.value })} />}
      <Segmented label={t('sad.diagram.direction')} options={directions(t)} value={line.twoWay ? 'two' : 'one'} onChange={(direction) => set({ twoWay: direction === 'two' })} />
      {choice(t('sad.diagram.pattern'), PATTERNS, line.pattern, (pattern) => set({ pattern }), (value) => t(`sad.diagram.patterns.${value}`))}
      {line.pattern === 'api' &&
        (apis.length > 0 ? (
          <Dropdown label={t('sad.diagram.api')} placeholder={t('sad.diagram.choose')} options={apis.map((api) => ({ value: api.id, label: api.name || '—' }))} value={line.api?.id ?? null} onValueChange={(id) => set({ api: { id } })} />
        ) : (
          <p className="text-sm text-text-subdued">{t('sad.diagram.noApis')}</p>
        ))}
      <Suggested label={t('sad.diagram.authentication')} value={line.authentication ?? ''} suggestions={AUTHENTICATIONS} onChange={(authentication) => set({ authentication })} />
      {choice(t('sad.diagram.classification'), DATA_CLASSIFICATIONS, line.classification, (classification) => set({ classification }), (value) => t(`sad.diagram.classifications.${value}`))}
      <TextField key={`${line.id}-purpose`} label={t('sad.diagram.purpose')} value={line.purpose ?? ''} onChange={(event) => set({ purpose: event.target.value })} />
      {choice(t('sad.diagram.flowType'), FLOW_TYPES, line.flow, (flow) => set({ flow }), (value) => t(`sad.diagram.flowTypes.${value}`))}
    </>
  )
}

/** Before submit: integration connections still missing facts (warning), and those on TLS 1.1 or 1.0 (not compliant, a warning that does not block). */
export function IntegrationNotes({ diagram }: { diagram: Diagram }) {
  const { t } = useTranslation()
  const name = namesOf(diagram)
  const ends = (line: Line) => `${name(line.from)} → ${name(line.to)}`
  const missing = diagram.lines.map((line) => [line, missingFacts('integration', line)] as const).filter(([, facts]) => facts.length > 0)
  const old = diagram.lines.filter(nonCompliantTls)
  return (
    <>
      {missing.length > 0 && (
        <PageMessage variant="warning" title={t('sad.diagram.missingTitle.integration')}>
          <ul className="list-disc pl-5">
            {missing.map(([line, facts]) => (
              <li key={line.id}>
                {ends(line)}: {facts.map((fact) => t(`sad.diagram.missing.${fact}`)).join(', ')}
              </li>
            ))}
          </ul>
        </PageMessage>
      )}
      {old.length > 0 && (
        <PageMessage variant="warning" title={t('sad.diagram.nonCompliantTitle')}>
          {t('sad.diagram.nonCompliantBody', { list: old.map(ends).join('; ') })}
        </PageMessage>
      )}
    </>
  )
}

interface MatrixRow {
  id: string
  environment: string
  diagram: Diagram
  line: Line
}

/** A box's zone as its full path, outermost first (e.g. "MY01 › Southeast Asia › vnet-crm › snet-app"). */
function zonePath(diagram: Diagram, id: string): string {
  const zones = new Map(diagram.zones.map((zone) => [zone.id, zone]))
  const path: string[] = []
  for (let at = diagram.boxes.find((box) => box.id === id)?.parentId; at !== undefined; at = zones.get(at)?.parentId) path.unshift(zones.get(at)!.label)
  return path.join(' › ') || '—'
}

/** Section 2's technical communication matrix: the integration connections of both tabs, generated from the diagram. */
export function TechnicalMatrix({ diagrams, apis }: { diagrams: Diagram[]; apis: DiagramApi[] }) {
  const { t } = useTranslation()
  const rows: MatrixRow[] = diagrams.flatMap((diagram) =>
    diagram.lines.filter((line) => line.layer === 'integration').map((line) => ({ id: `${diagram.id}/${line.id}`, environment: t(`sad.diagram.tabs.${diagram.tab}`), diagram, line })),
  )
  const name = (row: MatrixRow, id: string) => namesOf(row.diagram)(id)
  const columns: DataTableColumn<MatrixRow>[] = [
    { id: 'environment', header: t('sad.diagram.environment'), accessor: (row) => row.environment },
    { id: 'source', header: t('sad.diagram.sourceColumn'), accessor: (row) => name(row, row.line.from) },
    { id: 'sourceZone', header: t('sad.diagram.sourceZone'), accessor: (row) => zonePath(row.diagram, row.line.from) },
    { id: 'destination', header: t('sad.diagram.destination'), accessor: (row) => name(row, row.line.to) },
    { id: 'destinationZone', header: t('sad.diagram.destinationZone'), accessor: (row) => zonePath(row.diagram, row.line.to) },
    { id: 'protocol', header: t('sad.diagram.protocol'), accessor: (row) => row.line.protocol ?? '—' },
    { id: 'port', header: t('sad.diagram.port'), accessor: (row) => (row.line.port === undefined ? '—' : String(row.line.port)) },
    {
      id: 'tls',
      header: t('sad.diagram.tls'),
      cell: (row) => (
        <span className="inline-flex items-center gap-1">
          {nonCompliantTls(row.line) && <WarningIcon aria-hidden="true" className="shrink-0 text-icon-warning" />}
          {tlsText(t, row.line)}
        </span>
      ),
    },
    { id: 'direction', header: t('sad.diagram.direction'), accessor: (row) => (row.line.twoWay ? t('sad.diagram.twoWayShort') : t('sad.diagram.oneWay')) },
    { id: 'pattern', header: t('sad.diagram.pattern'), accessor: (row) => (row.line.pattern ? t(`sad.diagram.patterns.${row.line.pattern}`) : '—') },
    { id: 'authentication', header: t('sad.diagram.authentication'), accessor: (row) => row.line.authentication ?? '—' },
    { id: 'api', header: t('sad.diagram.api'), accessor: (row) => apiName(apis, row.line) },
    { id: 'classification', header: t('sad.diagram.classification'), accessor: (row) => (row.line.classification ? t(`sad.diagram.classifications.${row.line.classification}`) : '—') },
    { id: 'purpose', header: t('sad.diagram.purpose'), accessor: (row) => row.line.purpose ?? '—' },
    { id: 'flow', header: t('sad.diagram.flowType'), accessor: (row) => (row.line.flow ? t(`sad.diagram.flowTypes.${row.line.flow}`) : '—') },
  ]
  return (
    <DataTable<MatrixRow>
      caption={t('sad.diagram.technicalMatrix')}
      getRowId={(row) => row.id}
      rows={rows}
      emptyState={<p className="p-4 text-sm text-text-subdued">{t('sad.diagram.noConnections')}</p>}
      columns={columns}
    />
  )
}
