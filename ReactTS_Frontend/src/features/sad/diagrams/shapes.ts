import type { BlockType, DiagramSlot, DiagramView, SadSectionKey } from '../schemas'

/** Generic shapes a box can take (docs/modules/sad.md, Icons). Azure icons and TRM links come in later phases. */
export const SHAPES = ['person', 'external', 'web', 'api', 'worker', 'database', 'queue', 'storage', 'server', 'mobile', 'on-prem', 'firewall', 'wifi', 'vpn'] as const
export type Shape = (typeof SHAPES)[number]

/** The shape each solution diagram block type is drawn with (Azure icons come with build phase 3). */
export const BLOCK_SHAPE: Record<BlockType, Shape> = { actor: 'person', part: 'worker', business: 'web', external: 'external' }

/** The view each slot is drawn in by its owning section (other views are read-only in phase 1). */
export const OWNER_VIEW: Record<DiagramSlot, DiagramView> = { solution: 'solution', infrastructure: 'infrastructure', 'ci-cd': 'process', monitoring: 'monitoring' }

/** The section whose editors edit each view's part (as the API has it). */
export const VIEW_SECTION: Record<DiagramView, SadSectionKey> = {
  solution: 'solution-integration',
  'data-flow': 'data-architecture',
  infrastructure: 'network',
  integration: 'solution-integration',
  process: 'deployment',
  monitoring: 'logging',
}

/** Whether a section draws a slot here (its owner view), or only shows it. */
export function drawsHere(slot: DiagramSlot, view: DiagramView, owner: SadSectionKey, section: SadSectionKey): boolean {
  return owner === section && OWNER_VIEW[slot] === view
}

/** Slots that hold several titled diagrams (the infrastructure has fixed tabs, the solution one diagram). */
export const TITLED: Record<DiagramSlot, boolean> = { solution: false, infrastructure: false, 'ci-cd': true, monitoring: true }

/** The kinds of step in a CI or CD flow (as the API has them): Start and End, Step, Decision and Approval. */
export const PROCESS_STEPS = ['start', 'end', 'step', 'decision', 'approval'] as const
export type ProcessStep = (typeof PROCESS_STEPS)[number]
export const isStep = (type: string): type is ProcessStep => (PROCESS_STEPS as readonly string[]).includes(type)

/** Monitoring diagram blocks (as the API has them): monitoring services, other systems (from TRM or typed), teams or people. */
export const MONITORING_BLOCKS = ['monitoring', 'system', 'team'] as const
export type MonitoringBlock = (typeof MONITORING_BLOCKS)[number]
/** The generic shape each monitoring block is drawn with (an Azure service shows its icon instead). */
export const MONITORING_SHAPE: Record<MonitoringBlock, Shape | 'monitoring'> = { monitoring: 'monitoring', system: 'web', team: 'person' }
