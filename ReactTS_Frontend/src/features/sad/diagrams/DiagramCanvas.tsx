import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  NodeResizer,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { WarningIcon } from '../../../components/qi/icons'
import type { BlockType, Diagram } from '../schemas'
import { editFrom, linePath, toFlow, type BoxNodeData, type CanvasEdit, type LineEdgeData, type LineLabel, type ZoneNodeData } from './flow'
import { CHANGE_BORDER, CHANGE_LINE, CHANGE_STROKE } from './change-colours'
import { ChangeMark } from './ChangeMark'
import type { ChangeKind } from './compare'
import { azureIconUrl } from './icons'
import { useKindOf } from './labels'
import { BLOCK_SHAPE, MONITORING_SHAPE, type MonitoringBlock } from './shapes'
import { ShapeIcon } from './ShapeIcon'

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const

/** A connection point on every side: lines may start or end on any of them. */
function Handles() {
  return (
    <>
      {SIDES.map(([id, position]) => (
        <Handle key={id} id={id} type="source" position={position} isConnectable={false} style={{ opacity: 0 }} />
      ))}
    </>
  )
}

function ZoneNode({ data, selected }: NodeProps<Node<ZoneNodeData>>) {
  const { t } = useTranslation()
  return (
    <div className={cn('h-full w-full rounded-card border-2 border-dashed bg-surface-alternate/60', data.change ? CHANGE_BORDER[data.change] : 'border-divider-bold')}>
      <NodeResizer isVisible={data.resizable && selected} minWidth={120} minHeight={40} color="var(--color-border-focus)" />
      <Handles />
      <div className="flex items-center gap-2 px-3 pt-1.5 whitespace-nowrap">
        <span className="text-sm font-semibold text-text-default">{data.label}</span>
        {data.change && <ChangeMark change={data.change} />}
        {data.kind && <span className="text-xs text-text-subdued">{t(`sad.diagram.zoneKinds.${data.kind}`, { defaultValue: data.kind })}</span>}
        {data.empty && <span className="text-xs text-text-subdued italic">· {t('sad.diagram.empty')}</span>}
      </div>
    </div>
  )
}

function BoxNode({ data, selected }: NodeProps<Node<BoxNodeData & { kindLabel: string }>>) {
  const shape: string = BLOCK_SHAPE[data.type as BlockType] ?? MONITORING_SHAPE[data.type as MonitoringBlock] ?? data.type
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center gap-2 bg-surface-default px-3 shadow-sm',
        shape === 'person' ? 'rounded-full' : 'rounded-card',
        shape === 'external' && 'border-dashed',
        // A compared box is outlined in its change's colour instead.
        data.change ? `border-2 ${CHANGE_BORDER[data.change]}` : `border ${shape === 'external' ? 'border-divider-bold' : 'border-divider-default'}`,
        selected && 'outline-2 outline-offset-2 outline-border-focus',
      )}
    >
      <Handles />
      {data.change && <ChangeMark change={data.change} className="absolute -top-2.5 right-2" />}
      {data.icon ? <img src={azureIconUrl(data.icon)} alt="" className="size-8 shrink-0" /> : <ShapeIcon shape={shape} />}
      <div className="min-w-0">
        <div className="line-clamp-2 text-sm leading-tight font-semibold">{data.label}</div>
        <div className="truncate text-xs text-text-subdued">{data.kindLabel}</div>
      </div>
    </div>
  )
}

/**
 * A CI or CD step, drawn by kind: Start and End rounded, Step a box, Decision a diamond, Approval a box with a double
 * border and a seal (its kind says who approves, or that it is still missing).
 */
function StepNode({ data, selected }: NodeProps<Node<BoxNodeData & { kindLabel: string }>>) {
  const decision = data.type === 'decision'
  const unnamed = data.type === 'approval' && !data.approver
  // A compared step is outlined in its change's colour; otherwise Start, End and Approval have a bold edge.
  const border = data.change ? CHANGE_BORDER[data.change] : ['start', 'end', 'approval'].includes(data.type) ? 'border-divider-bold' : 'border-divider-default'
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center gap-2 px-4 text-center',
        !decision && ['bg-surface-default shadow-sm', data.type === 'approval' ? 'border-4 border-double' : data.change ? 'border-2' : 'border', border].join(' '),
        data.type === 'start' || data.type === 'end' ? 'rounded-full' : 'rounded-card',
        selected && 'outline-2 outline-offset-2 outline-border-focus',
      )}
    >
      {decision && (
        <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible" viewBox="0 0 176 64" preserveAspectRatio="none">
          <polygon points="88,1 175,32 88,63 1,32" className={cn('fill-surface-default', data.change ? CHANGE_STROKE[data.change] : 'stroke-divider-bold')} strokeWidth={data.change ? 2.5 : 1.5} />
        </svg>
      )}
      <Handles />
      {data.change && <ChangeMark change={data.change} className="absolute -top-2.5 right-2" />}
      {data.icon ? <img src={azureIconUrl(data.icon)} alt="" className="relative size-6 shrink-0" /> : data.type === 'approval' && <ShapeIcon shape="approval" className="size-6" />}
      <div className="relative min-w-0">
        <div className={cn('line-clamp-2 leading-tight font-semibold', decision ? 'text-xs' : 'text-sm')}>{data.label}</div>
        <div className="truncate text-xs text-text-subdued">
          {unnamed && <WarningIcon aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px] text-icon-warning" />}
          {data.kindLabel}
        </div>
      </div>
    </div>
  )
}

/** A line; its label selects it (labels are drawn outside the line's SVG, so they carry the select handler). */
function LineEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, markerStart, selected }: EdgeProps<Edge<LineEdgeData & { select: (id: string) => void }>>) {
  const { t } = useTranslation()
  const [path, labelX, labelY] = linePath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }, data?.spread)
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{ stroke: data?.change ? CHANGE_LINE[data.change] : 'var(--color-icon-default)', strokeWidth: selected || data?.change ? 2.5 : 1.5, strokeDasharray: data?.dashed ? '6 4' : undefined }}
      />
      {(data?.label || data?.change) && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => data.select(id)}
            // The warning icon is not read out: the name says it, after the visible label.
            aria-label={
              data.missing || data.nonCompliant || data.change
                ? [data.change && t(`sad.compare.kinds.${data.change}`), data.label, data.missing && t('sad.diagram.factsMissing'), data.nonCompliant && t('sad.diagram.tlsNotCompliant')].filter(Boolean).join(' ')
                : undefined
            }
            className={cn('nodrag nopan absolute max-w-56 rounded-button border border-divider-default bg-surface-default px-1.5 py-0.5 text-left text-xs shadow-sm', selected && 'outline-2 outline-border-focus')}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all', zIndex: 1000 }}
          >
            {data.change && <ChangeMark change={data.change} />}
            {/* A real space, not a margin: the visible words must read "Added HTTPS 443" for the name to contain them (WCAG 2.5.3). */}
            {data.change && data.label && ' '}
            {(data.missing || data.nonCompliant) && <WarningIcon aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px] text-icon-warning" />}
            {data.label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/** Fitting never zooms past 100%, so one small box does not fill the canvas. */
const FIT = { padding: 0.05, maxZoom: 1 }

/** Fits the view when the canvas opens and whenever a zone or box is added or removed (not while one is dragged), so nothing new lands off the canvas. */
function FitWhenItemsChange({ items }: { items: string }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    void fitView(FIT)
  }, [items, fitView])
  return null
}

const NODE_TYPES = { zone: ZoneNode, box: BoxNode, step: StepNode }
const EDGE_TYPES = { line: LineEdge }

/** One diagram on a React Flow canvas. Everything shown comes from the diagram; drags and resizes come back as edits. */
export function DiagramCanvas({
  diagram,
  editable,
  selected,
  onSelect,
  onEdits,
  lineLabel,
  boxKind,
  marks,
}: {
  diagram: Diagram
  editable: boolean
  selected: string | null
  onSelect: (id: string | null) => void
  /** Every drag, resize or selection in one canvas event, applied together */
  onEdits: (edits: CanvasEdit[]) => void
  /** What lines show in this view (their label when left out) */
  lineLabel?: LineLabel
  /** What a box is called under its name (its block type or shape when left out) */
  boxKind?: (data: BoxNodeData) => string
  /** Version compare: how each zone, box and line changed (shown in colour with its word) */
  marks?: ReadonlyMap<string, ChangeKind>
}) {
  const { t } = useTranslation()
  const blockOrShape = useKindOf()
  const kindOf = boxKind ?? blockOrShape
  const { nodes, edges } = useMemo(() => {
    const flow = toFlow(diagram, { selected, editable, lineLabel, marks })
    return {
      nodes: flow.nodes.map((node) => (node.type === 'zone' ? node : { ...node, data: { ...node.data, kindLabel: kindOf(node.data as BoxNodeData) } })),
      edges: flow.edges.map((edge) => ({ ...edge, data: { ...edge.data, select: onSelect } })),
    }
  }, [diagram, selected, editable, onSelect, lineLabel, kindOf, marks])
  return (
    <div className="h-[min(560px,60vh)] rounded-card border border-divider-default">
        <ReactFlow
          aria-label={t('sad.diagram.canvas', { title: diagram.title })}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={(changes) => {
            const edits = changes.map(editFrom).filter((edit): edit is CanvasEdit => edit !== null)
            if (edits.length > 0) onEdits(edits)
          }}
          onNodeClick={(_, node) => onSelect(node.id)}
          onEdgeClick={(_, edge) => onSelect(edge.id)}
          onPaneClick={() => onSelect(null)}
          nodesDraggable={editable}
          nodesConnectable={false}
          connectionMode={ConnectionMode.Loose}
          elevateNodesOnSelect={false}
          minZoom={0.2}
          colorMode="system"
        >
          <FitWhenItemsChange items={[diagram.id, ...diagram.zones.map((zone) => zone.id), ...diagram.boxes.map((box) => box.id)].join(' ')} />
          <Background gap={16} />
          <Controls showInteractive={false} position="top-right" fitViewOptions={FIT} />
        </ReactFlow>
    </div>
  )
}
