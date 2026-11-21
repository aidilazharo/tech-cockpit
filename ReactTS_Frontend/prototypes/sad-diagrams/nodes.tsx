import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Handle, NodeResizer, Position, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { useContext, type ReactNode } from 'react'
import { cn } from '../../src/lib/cn'
import { CHANGE_CLASS, CHANGE_LABEL, SelectContext, strokeOf, type Change } from './style'

/** Extra facts shown in the details panel when the item is selected (not drawn on the canvas). */
export type Facts = [string, string][]

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const

/** Connection points on every side (connections may start or end on any of them). */
function Handles() {
  return (
    <>
      {SIDES.map(([id, position]) => (
        <Handle key={id} id={id} type="source" position={position} style={{ opacity: 0 }} />
      ))}
    </>
  )
}

function ChangeTag({ change }: { change?: Change }) {
  if (!change) return null
  return <span className={cn('absolute -top-3 right-2 rounded-tag border-2 bg-surface-default px-1.5 text-xs font-semibold', CHANGE_CLASS[change])}>{CHANGE_LABEL[change]}</span>
}

// ----- Zones (network zones, Azure hierarchy levels, grouping boxes)

export type ZoneData = { label: string; kind?: string; tone?: 'outer' | 'inner' | 'group'; icon?: string; facts?: Facts; /** Nothing inside */ empty?: boolean; /** Sizes by hand: corners can be dragged when selected */ resizable?: boolean }
export type ZoneNodeType = Node<ZoneData, 'zone'>

export function ZoneNode({ data, selected }: NodeProps<ZoneNodeType>) {
  return (
    <div
      className={cn(
        'h-full w-full rounded-card border-2 border-dashed',
        data.tone === 'inner' ? 'border-divider-default bg-surface-default' : data.tone === 'group' ? 'border-border-selected bg-surface-selected-1' : 'border-divider-bold bg-surface-alternate',
      )}
    >
      <NodeResizer isVisible={Boolean(data.resizable && selected)} minWidth={120} minHeight={40} color="var(--color-border-focus)" />
      <Handles />
      <div className="flex items-center gap-2 px-3 pt-1.5 whitespace-nowrap">
        {data.icon && <img src={data.icon} alt="" className="size-4" />}
        <span className="text-sm font-semibold text-text-default">{data.label}</span>
        {data.kind && <span className="text-xs text-text-subdued">{data.kind}</span>}
        {data.empty && <span className="text-xs text-text-subdued italic">· empty</span>}
      </div>
    </div>
  )
}

// ----- Process lanes (team or tool)

export type LaneNodeType = Node<{ label: string }, 'lane'>

export function LaneNode({ data }: NodeProps<LaneNodeType>) {
  return (
    <div className="flex h-full w-full rounded-card border border-divider-default bg-surface-alternate">
      <div className="flex w-28 shrink-0 items-center justify-center border-r border-divider-default px-2 text-center text-sm font-semibold">{data.label}</div>
    </div>
  )
}

// ----- Boxes

export type BoxKind = 'part' | 'system' | 'external' | 'actor' | 'service' | 'device'
export type BoxData = { label: string; sub?: string; icon?: string; kind: BoxKind; change?: Change; dimmed?: boolean; missing?: boolean; facts?: Facts }
export type BoxNodeType = Node<BoxData, 'box'>

function GenericIcon({ kind }: { kind: BoxKind }) {
  const common = { className: 'size-7 shrink-0 text-icon-default', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true }
  if (kind === 'actor') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </svg>
    )
  }
  if (kind === 'device') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19" />
      </svg>
    )
  }
  if (kind === 'external') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M7 13h6M7 16h10" />
    </svg>
  )
}

export function BoxNode({ data, selected }: NodeProps<BoxNodeType>) {
  return (
    <div
      className={cn(
        'relative flex w-44 items-center gap-2 rounded-card border bg-surface-default px-3 py-2 shadow-sm',
        data.kind === 'external' ? 'border-dashed border-divider-bold' : 'border-divider-default',
        data.kind === 'actor' && 'rounded-full',
        data.kind === 'part' && 'border-l-4 border-l-border-selected',
        data.missing && 'border-2 border-icon-warning',
        data.change && cn('border-2', CHANGE_CLASS[data.change]),
        selected && 'outline-2 outline-offset-2 outline-border-focus',
        data.dimmed && 'opacity-30',
      )}
    >
      <Handles />
      <ChangeTag change={data.change} />
      {data.icon ? <img src={data.icon} alt="" className="size-7 shrink-0" /> : <GenericIcon kind={data.kind} />}
      <div className="min-w-0">
        <div className="text-sm leading-tight font-semibold break-words">{data.label}</div>
        {data.sub && <div className="text-xs leading-tight break-words text-text-subdued">{data.sub}</div>}
      </div>
    </div>
  )
}

// ----- Process flow steps

export type StepData = { label: string; shape: 'step' | 'decision' | 'start'; facts?: Facts }
export type StepNodeType = Node<StepData, 'step'>

export function StepNode({ data, selected }: NodeProps<StepNodeType>) {
  if (data.shape === 'decision') {
    return (
      <div className={cn('relative flex size-28 items-center justify-center', selected && 'outline-2 outline-border-focus')}>
        <Handles />
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
          <polygon points="50,2 98,50 50,98 2,50" fill="var(--color-surface-default)" stroke="var(--color-border-default)" strokeWidth="2" />
        </svg>
        <span className="relative max-w-20 text-center text-xs font-semibold">{data.label}</span>
      </div>
    )
  }
  return (
    <div
      className={cn(
        'relative flex w-44 items-center justify-center border border-divider-default bg-surface-default px-3 py-3 text-center text-sm font-semibold shadow-sm',
        data.shape === 'start' ? 'rounded-full' : 'rounded-card',
        selected && 'outline-2 outline-offset-2 outline-border-focus',
      )}
    >
      <Handles />
      {data.label}
    </div>
  )
}

// ----- Connections

export type FactData = { lines: string[]; dashed?: boolean; missing?: boolean; change?: Change; facts?: Facts; todo?: string[]; /** How far the line runs out of a box before turning (routes it around zones) */ offset?: number; /** Infrastructure line or integration connection (each view shows its own) */ layer?: 'infra' | 'integration'; /** Values for the communication matrix */ row?: Record<string, string> }
export type FactEdgeType = Edge<FactData, 'fact'>

export function FactEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, markerStart, selected }: EdgeProps<FactEdgeType>) {
  const select = useContext(SelectContext)
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10, offset: data?.offset })
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{ stroke: strokeOf(data ?? {}), strokeWidth: selected ? 2.5 : 1.5, strokeDasharray: data?.dashed ? '6 4' : undefined }}
      />
      {data && data.lines.length > 0 && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => select(id)}
            className={cn(
              'nodrag nopan absolute max-w-56 rounded-button border bg-surface-default px-1.5 py-0.5 text-left text-xs leading-snug shadow-sm',
              data.missing || data.change === 'changed' ? 'border-icon-warning' : data.change === 'added' ? 'border-icon-success' : data.change === 'removed' ? 'border-icon-error' : 'border-divider-default',
              selected && 'outline-2 outline-border-focus',
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all', zIndex: 1000 }}
          >
            {data.change && <span className="block font-semibold">{CHANGE_LABEL[data.change]}</span>}
            {data.lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/** A labelled definition row used in the details panel. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold text-text-subdued">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}
