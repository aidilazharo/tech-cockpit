import type { Box, Diagram } from '../schemas'
import { addBox, BOX_HEIGHT, BOX_WIDTH } from './model'
import type { MonitoringBlock } from './shapes'

/**
 * The monitoring services offered first (docs/modules/sad.md): Dynatrace, which most AIA applications use, then Azure's,
 * with their Azure icons. Anything else is typed. The list changes with releases.
 */
export const MONITORING_SERVICES: { name: string; icon?: string }[] = [
  { name: 'Dynatrace' },
  { name: 'Azure Monitor', icon: 'monitor' },
  { name: 'Application Insights', icon: 'application-insights' },
  { name: 'Log Analytics', icon: 'log-analytics-workspaces' },
  { name: 'Microsoft Sentinel', icon: 'azure-sentinel' },
  { name: 'Workbooks', icon: 'azure-workbooks' },
]

const normal = (name: string) => name.trim().toLowerCase()
/** The built-in service a name matches, whatever its case and spaces. */
export const builtInService = (name: string) => MONITORING_SERVICES.find((service) => normal(service.name) === normal(name))
/** The Azure icon of the built-in service a name matches, if any. */
export const serviceIcon = (name: string) => builtInService(name)?.icon

/**
 * Top-level blocks stand in columns: monitoring services, then other systems, then teams. Rows are far enough apart
 * that the labels of lines meeting at one block stay 24px apart when a phone fits the diagram (zoom about 0.4).
 */
const COLUMN: Record<MonitoringBlock, number> = { monitoring: 0, system: 1, team: 2 }
const COLUMN_STEP = BOX_WIDTH + 120
const GAP = 80

/** Adds a block below the last of its column (or into its group); a built-in Azure service takes its icon. */
export function addMonitoringBlock(d: Diagram, block: { label: string; type: MonitoringBlock; parentId?: string; application?: Box['application'] }): Diagram {
  const icon = block.type === 'monitoring' ? serviceIcon(block.label) : undefined
  const added = { ...block, ...(icon ? { icon } : {}) }
  if (block.parentId !== undefined) return addBox(d, added)
  const column = d.boxes.filter((box) => box.parentId === undefined && box.type === block.type)
  const y = column.length === 0 ? 0 : Math.max(...column.map((box) => box.y)) + BOX_HEIGHT + GAP
  return addBox(d, added, { x: COLUMN[block.type] * COLUMN_STEP, y })
}
