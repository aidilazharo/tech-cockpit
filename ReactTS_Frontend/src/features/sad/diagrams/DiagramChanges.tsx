import { useTranslation } from 'react-i18next'
import { DataTable } from '../../../components/qi'
import type { Box, Diagram, DiagramRef, DiagramSlot, DiagramView, Line, Zone } from '../schemas'
import { ChangeMark } from './ChangeMark'
import type { ComparedVersion, DiagramComparison, Field, ItemChange, Side } from './compare'
import { DiagramCanvas } from './DiagramCanvas'
import { formatSize } from './files'
import { lineStyle } from './helpers'
import { apiName, boxKind, dataObjects, tlsText, useInfraKindOf, useKindOf, useLineLabel } from './labels'
import { OWNER_VIEW } from './shapes'

type T = (key: string, options?: Record<string, unknown>) => string
const noop = () => {}

/** Where each field's name comes from: the compare page's words, or the diagram's own. */
const FIELD_LABELS: Record<Field, string> = {
  name: 'sad.compare.fields.name',
  kind: 'sad.compare.fields.kind',
  inside: 'sad.compare.fields.inside',
  title: 'sad.compare.fields.title',
  reason: 'sad.compare.fields.reason',
  ends: 'sad.compare.fields.ends',
  label: 'sad.compare.fields.label',
  style: 'sad.compare.fields.style',
  calls: 'sad.diagram.calls',
  does: 'sad.diagram.does',
  direction: 'sad.diagram.direction',
  data: 'sad.diagram.dataObjects',
  classification: 'sad.diagram.classification',
  frequency: 'sad.diagram.frequency',
  protocol: 'sad.diagram.protocol',
  port: 'sad.diagram.port',
  tls: 'sad.diagram.tls',
  pattern: 'sad.diagram.pattern',
  authentication: 'sad.diagram.authentication',
  api: 'sad.diagram.api',
  purpose: 'sad.diagram.purpose',
  flow: 'sad.diagram.flowType',
}

const drawnOn = (side: Side) => ('diagram' in side ? side.diagram : null)
const diagramName = (t: T, diagram: Diagram) => (diagram.tab ? t(`sad.diagram.tabs.${diagram.tab}`) : diagram.title)

/** A compared diagram's heading: the slot in this view, then the tab or the diagram's title (the solution diagram has none). */
function heading(t: T, ref: DiagramRef, comparison: DiagramComparison): string {
  const slotName = t(`sad.diagram.slots.${ref.slot}`)
  const title = ref.view === OWNER_VIEW[ref.slot] ? slotName : t('sad.diagram.inView', { slot: slotName, view: t(`sad.diagram.views.${ref.view}`) })
  const diagram = drawnOn(comparison.after) ?? drawnOn(comparison.before)
  return diagram && ref.slot !== 'solution' ? `${title} — ${diagramName(t, diagram)}` : title
}

/** The infrastructure diagram's views show only their own lines (as the panes do). */
const shownIn = (slot: DiagramSlot, view: DiagramView, diagram: Diagram): Diagram =>
  slot === 'infrastructure' ? { ...diagram, lines: diagram.lines.filter((line) => (line.layer === 'integration') === (view === 'integration')) } : diagram

/** One version's picture of a compared diagram, with what changed marked; or why there is none. */
function Picture({ slot, view, title, label, side, marks }: { slot: DiagramSlot; view: DiagramView; title: string; label: string; side: Side; marks: ReadonlyMap<string, ItemChange['kind']> }) {
  const { t } = useTranslation()
  const lineLabel = useLineLabel(view)
  const infraKindOf = useInfraKindOf()
  return (
    <section aria-label={t('sad.compare.pictures', { diagram: title, label })} className="flex min-w-0 flex-col gap-2">
      <h4 className="text-base font-semibold">{label}</h4>
      {'diagram' in side ? (
        <DiagramCanvas
          diagram={shownIn(slot, view, side.diagram)}
          editable={false}
          selected={null}
          onSelect={noop}
          onEdits={noop}
          lineLabel={view === 'solution' || view === 'data-flow' || view === 'integration' ? lineLabel : undefined}
          boxKind={slot === 'infrastructure' ? infraKindOf : undefined}
          marks={marks}
        />
      ) : 'notApplicable' in side ? (
        <p>{t('sad.diagram.notApplicableShown', { reason: side.notApplicable })}</p>
      ) : (
        <p className="text-text-subdued">{t('sad.compare.notIn', { label })}</p>
      )}
    </section>
  )
}

/** Each change in words: the item, then what it was and what it became (only what changed; everything when it was added or removed). */
function ChangeList({ slot, view, comparison, before, after }: { slot: DiagramSlot; view: DiagramView; comparison: DiagramComparison; before: ComparedVersion; after: ComparedVersion }) {
  const { t } = useTranslation()
  const kindOf = useKindOf()
  const infraKindOf = useInfraKindOf()
  const diagrams = { before: drawnOn(comparison.before), after: drawnOn(comparison.after) }
  const apis = { before: before.apis, after: after.apis }
  const namesOn = (diagram: Diagram) => {
    const names = new Map([...diagram.zones, ...diagram.boxes].map((item) => [item.id, item.label]))
    // Parents and line ends are on the same diagram.
    return (id: string | undefined) => (id === undefined ? '—' : names.get(id)!)
  }
  const choice = (key: string, value: string | undefined) => (value ? t(`${key}.${value}`) : '—')

  function value(field: Field, change: ItemChange, side: 'before' | 'after'): string {
    // Zones, boxes and lines are compared only between two drawn diagrams.
    const name = namesOn(diagrams[side]!)
    if (change.type === 'zone' || change.type === 'box') {
      const item = change[side] as Zone | Box
      if (field === 'name') return item.label
      if (field === 'inside') return name(item.parentId)
      // A grouping box's kind is the author's own text (e.g. "This application"); zone kinds and lanes are named.
      if (change.type === 'zone') return (item as Zone).kind ? t(`sad.diagram.zoneKinds.${(item as Zone).kind}`, { defaultValue: (item as Zone).kind }) : '—'
      const box = item as Box
      const data = { ...boxKind(box), ...(box.approver ? { approver: box.approver } : {}) }
      return slot === 'infrastructure' ? infraKindOf(data) : kindOf(data)
    }
    const line = change[side] as Line
    switch (field) {
      case 'ends':
        return `${name(line.from)} → ${name(line.to)}`
      case 'direction':
        return line.twoWay ? t('sad.diagram.twoWayShort') : t('sad.diagram.oneWay')
      case 'data':
        return dataObjects(line).join('; ') || '—'
      case 'classification':
        return choice('sad.diagram.classifications', line.classification)
      case 'pattern':
        return choice('sad.diagram.patterns', line.pattern)
      case 'flow':
        return choice('sad.diagram.flowTypes', line.flow)
      case 'port':
        return line.port === undefined ? '—' : String(line.port)
      case 'tls':
        return tlsText(t, line)
      case 'api':
        return apiName(apis[side], line)
      case 'style':
        return lineStyle(t, line)
      default:
        return (line[field as 'calls' | 'does' | 'frequency' | 'protocol' | 'authentication' | 'purpose' | 'label'] as string | undefined) ?? '—'
    }
  }

  /** What one side says about a change: nothing when the item is not on that side. */
  function facts(change: ItemChange, side: 'before' | 'after'): string[] | null {
    if (change[side] === undefined) return null
    switch (change.type) {
      case 'file':
        return [`${change[side].name} (${change[side].type.toUpperCase()}, ${formatSize(change[side].size)})`]
      case 'diagram':
        return [change.fields.includes('title') ? `${t('sad.compare.fields.title')}: ${change[side].title}` : diagramName(t, change[side])]
      case 'reason':
        return [`${t('sad.compare.fields.reason')}: ${change[side]}`]
      default:
        return change.fields.map((field) => `${t(FIELD_LABELS[field])}: ${value(field, change, side)}`)
    }
  }

  function itemName(change: ItemChange): string {
    const item = (key: string, name: string) => t(`sad.compare.items.${key}`, { name })
    switch (change.type) {
      case 'zone':
        return item(slot === 'infrastructure' ? 'zone' : slot === 'ci-cd' ? 'lane' : 'group', (change.after ?? change.before)!.label)
      case 'box':
        return item(slot === 'infrastructure' ? 'box' : slot === 'ci-cd' ? 'step' : 'block', (change.after ?? change.before)!.label)
      case 'line': {
        const side = change.after ? 'after' : 'before'
        return item(view === 'infrastructure' ? 'line' : 'connection', value('ends', change, side))
      }
      case 'file':
        return item('file', (change.after ?? change.before)!.name)
      case 'diagram':
        return item('diagram', diagramName(t, (change.after ?? change.before)!))
      case 'reason':
        return t('sad.compare.items.reason')
    }
  }

  const cell = (change: ItemChange, side: 'before' | 'after') => {
    const said = facts(change, side)
    return said ? (
      <ul>
        {said.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    ) : (
      '—'
    )
  }
  return (
    <DataTable<{ id: string; change: ItemChange }>
      caption={t('sad.compare.changes', { count: comparison.changes.length })}
      getRowId={(row) => row.id}
      rows={comparison.changes.map((change, index) => ({ id: String(index), change }))}
      columns={[
        { id: 'change', header: t('sad.compare.change'), cell: (row) => <ChangeMark change={row.change.kind} /> },
        { id: 'item', header: t('sad.compare.item'), accessor: (row) => itemName(row.change) },
        { id: 'before', header: before.label, cell: (row) => cell(row.change, 'before') },
        { id: 'after', header: after.label, cell: (row) => cell(row.change, 'after') },
      ]}
    />
  )
}

/** The diagrams of a section that changed between two versions: both pictures side by side (stacked when narrow), a legend, then the list of changes. */
export function DiagramChanges({ changes, before, after }: { changes: { ref: DiagramRef; comparison: DiagramComparison }[]; before: ComparedVersion; after: ComparedVersion }) {
  const { t } = useTranslation()
  return changes.map(({ ref, comparison }) => {
    const title = heading(t, ref, comparison)
    const id = `changes-${ref.slot}-${ref.view}-${comparison.id}`
    return (
      <section key={id} aria-labelledby={id} className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
        <h3 id={id} className="heading-4">
          {title}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{t('sad.compare.legend')}</span>
          {(['added', 'removed', 'changed'] as const).map((kind) => (
            <ChangeMark key={kind} change={kind} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Picture slot={ref.slot} view={ref.view} title={title} label={before.label} side={comparison.before} marks={comparison.marks.before} />
          <Picture slot={ref.slot} view={ref.view} title={title} label={after.label} side={comparison.after} marks={comparison.marks.after} />
        </div>
        <ChangeList slot={ref.slot} view={ref.view} comparison={comparison} before={before} after={after} />
      </section>
    )
  })
}
