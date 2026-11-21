import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Box, DiagramApi, DiagramView, Line } from '../schemas'
import type { LineLabel } from './flow'
import { missingFacts, nonCompliantTls } from './model'
import { azureIconName } from './icons'
import { BLOCK_SHAPE, isStep, MONITORING_SHAPE } from './shapes'

/** Data objects and key attributes, one per line, as one line of text. */
export const dataObjects = (line: Line) => (line.data ?? '').split('\n').map((item) => item.trim()).filter(Boolean)

type KindData = { type: string; trm?: string | null; server?: true; icon?: string; approver?: string }
/** With an Azure icon, its product name comes first (Microsoft's terms: show it near the icon); an Azure service is just that. */
const withProduct = (kind: string, { type, icon }: KindData) => (icon ? (type === 'azure' ? azureIconName(icon) : `${azureIconName(icon)} · ${kind}`) : kind)

/** What a box is: a solution block's type (with its TRM number, or "typed" for a business application), else its shape. */
export function useKindOf() {
  const { t } = useTranslation()
  return useCallback(
    (data: KindData) => {
      const { type, trm, approver } = data
      if (type === 'approval') return withProduct(approver ? t('sad.diagram.approvalBy', { approver }) : t('sad.diagram.approverMissing'), data)
      if (isStep(type)) return withProduct(t(`sad.diagram.steps.${type}`), data)
      // Monitoring diagram: an other system picked from TRM or typed, as a business application on the solution diagram.
      if (type === 'system') return withProduct(trm === undefined ? t('sad.diagram.systemTyped') : t('sad.diagram.systemFromTrm', { number: trm ?? '' }), data)
      if (type in MONITORING_SHAPE) return withProduct(t(`sad.diagram.monitoringBlocks.${type}`), data)
      if (type === 'business') return withProduct(trm === undefined ? t('sad.diagram.blockTyped') : t('sad.diagram.blockFromTrm', { number: trm ?? '' }), data)
      return withProduct(t(type in BLOCK_SHAPE ? `sad.diagram.blocks.${type}` : `sad.diagram.shapes.${type}`, { defaultValue: type }), data)
    },
    [t],
  )
}

/** A box's kind for tables and details (the canvas gets the same from its node data). */
export const boxKind = (box: Box): KindData => ({
  type: box.type,
  ...(box.application ? { trm: box.application.number } : {}),
  ...(box.server ? { server: true as const } : {}),
  ...(box.icon ? { icon: box.icon } : {}),
})

/** What an infrastructure box is: server / VM (from TRM or typed), a business application, or its kind. */
export function useInfraKindOf() {
  const { t } = useTranslation()
  const kindOf = useKindOf()
  return useCallback(
    (data: KindData) => {
      if (data.type === 'business') return kindOf(data)
      if (data.type === 'server' && data.server) return withProduct(t('sad.diagram.serverFromTrm'), data)
      return withProduct(t(`sad.diagram.infraTypes.${data.type}`, { defaultValue: data.type }), data)
    },
    [t, kindOf],
  )
}

/**
 * What a solution diagram line shows in a view: what it calls (Solution view), or its data objects with their
 * classification and frequency (Data flow view); marked when facts needed before submit are missing.
 */
export function useLineLabel(view: DiagramView): LineLabel {
  const { t } = useTranslation()
  return useCallback(
    (line: Line) => {
      const missing = missingFacts(view, line).length > 0
      if (view === 'solution') return { label: line.calls?.trim() || t('sad.diagram.notDescribed'), missing }
      if (view === 'integration') {
        // Protocol and port, then TLS (or what protects it): "HTTPS 443 · TLS 1.2", "SFTP 22 · SSH".
        const transport = [line.protocol, line.port].filter((part) => part !== undefined).join(' ')
        const security = line.tls === 'none' ? line.protection || t('sad.diagram.notTls') : line.tls && `TLS ${line.tls}`
        return { label: [transport || t('sad.diagram.notDescribed'), security].filter(Boolean).join(' · '), missing, nonCompliant: nonCompliantTls(line) }
      }
      const data = dataObjects(line)
      if (data.length === 0) return { label: t('sad.diagram.noData'), missing }
      const classification = line.classification && t(`sad.diagram.classifications.${line.classification}`)
      return { label: [data.join('; '), classification, line.frequency?.trim()].filter(Boolean).join(' · '), missing }
    },
    [t, view],
  )
}

/** The TLS version in words: "1.2", "1.0 (not compliant)", or "Not TLS: SSH". */
export function tlsText(t: (key: string) => string, line: Line): string {
  if (!line.tls) return '—'
  if (line.tls === 'none') return line.protection ? `${t('sad.diagram.notTls')}: ${line.protection}` : t('sad.diagram.notTls')
  return nonCompliantTls(line) ? `${line.tls} (${t('sad.diagram.notCompliant')})` : line.tls
}

/** The name of the API a connection links to (names only, from the API inventory). */
export const apiName = (apis: DiagramApi[], line: Line) => (line.api ? (apis.find((api) => api.id === line.api!.id)?.name ?? '—') : '—')

/** An integration connection's facts, read-only. */
export function integrationFacts(t: (key: string) => string, line: Line, apis: DiagramApi[]): [string, string][] {
  return [
    [t('sad.diagram.protocol'), line.protocol ?? '—'],
    [t('sad.diagram.port'), line.port === undefined ? '—' : String(line.port)],
    [t('sad.diagram.tls'), tlsText(t, line)],
    [t('sad.diagram.direction'), line.twoWay ? t('sad.diagram.twoWayShort') : t('sad.diagram.oneWay')],
    [t('sad.diagram.pattern'), line.pattern ? t(`sad.diagram.patterns.${line.pattern}`) : '—'],
    [t('sad.diagram.api'), apiName(apis, line)],
    [t('sad.diagram.authentication'), line.authentication ?? '—'],
    [t('sad.diagram.classification'), line.classification ? t(`sad.diagram.classifications.${line.classification}`) : '—'],
    [t('sad.diagram.purpose'), line.purpose ?? '—'],
    [t('sad.diagram.flowType'), line.flow ? t(`sad.diagram.flowTypes.${line.flow}`) : '—'],
  ]
}

