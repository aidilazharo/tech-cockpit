import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../../../components/page/ConfirmDialog'
import { Button, Checkbox, DataTable, Dropdown, PageMessage, TextField } from '../../../../components/qi'
import { useBusinessApplications } from '../../queries'
import type { BusinessApplication, Diagram, DiagramSlot, Hosting } from '../../schemas'
import { azureIconName } from '../icons'
import { addDiagram } from '../model'
import { FileChooser, Segmented } from '../parts'
import { TITLED } from '../shapes'
import { importDiagram, INTO, kindsFor, LINKABLE, reviewOf, reviewProblems, SKIP, stepsWithoutLane, type NotImported, type ReviewRow, type RowProblem, type TrmLink } from './convert'
import { checkFile, DrawioError, readDrawio, type DrawioPage, type DrawioProblem } from './read'

type Drawn = { diagrams: Diagram[]; hosting?: Hosting }
/** One page's review: its rows, the lanes named in the review, TRM matches found and those the author unticked. */
type PageState = { rows: ReviewRow[]; lanes: string[]; matches: Record<string, TrmLink>; declined: string[] }
const MAX_DIAGRAMS = 10
const KIND_KEYS: Partial<Record<DiagramSlot, string>> = { solution: 'blocks', 'ci-cd': 'steps', monitoring: 'monitoringBlocks' }

const normal = (text: string) => text.trim().toLowerCase()
const something = (d: Diagram) => d.boxes.length > 0 || d.lines.length > 0

/** What each kind is called; on the infrastructure diagram, zone kinds, the fixed zones by their names on the tab, and box kinds. */
function useKindLabel(slot: DiagramSlot, current: Diagram) {
  const { t } = useTranslation()
  return (kind: string, container: boolean) => {
    if (kind === SKIP) return t('sad.diagram.import.skip')
    if (slot === 'infrastructure') {
      if (kind.startsWith(INTO)) return t('sad.diagram.import.into', { name: current.zones.find((zone) => zone.id === kind.slice(INTO.length))?.label })
      return t(container ? `sad.diagram.zoneKinds.${kind}` : `sad.diagram.infraTypes.${kind}`)
    }
    return kind === 'group' ? t('sad.diagram.import.group') : kind === 'lane' ? t('sad.diagram.lane') : t(`sad.diagram.${KIND_KEYS[slot]}.${kind}`)
  }
}

/** Where each infrastructure zone or box kind may sit, as a message key. */
const PLACE: Record<string, string> = { vnet: 'vnet', subnet: 'subnet', internet: 'own', 'azure-global': 'own', 'third-party': 'own', firewall: 'device', wifi: 'device', vpn: 'device' }

/** Offers a TRM application whose name or APM number is exactly a block's text, ticked unless the author unticks it. */
function TrmMatch({ versionId, row, match, declined, onMatch, onDecline }: { versionId: string; row: ReviewRow; match?: TrmLink; declined: boolean; onMatch: (app: TrmLink) => void; onDecline: (declined: boolean) => void }) {
  const { t } = useTranslation()
  const found = useBusinessApplications(versionId, row.label)
  const exact = found.data?.items.find((app: BusinessApplication) => normal(app.name) === normal(row.label) || (app.number !== null && normal(app.number) === normal(row.label)))
  useEffect(() => {
    if (exact && exact.id !== match?.id) onMatch({ id: exact.id, number: exact.number, name: exact.name })
  }, [exact, match, onMatch])
  if (!exact) return <>—</>
  return <Checkbox label={t('sad.diagram.import.link', { name: exact.name, number: exact.number ?? '—' })} checked={!declined} onCheckedChange={(on) => onDecline(!on)} />
}

/** What a list of things not imported says, in one sentence. */
function useNotImported() {
  const { t } = useTranslation()
  const name = (text: string | undefined) => text || t('sad.diagram.import.noText')
  return (items: NotImported[]) =>
    t('sad.diagram.import.notImported', {
      list: items.map((item) => t(`sad.diagram.import.reasons.${item.reason}`, { label: item.label, from: name(item.from), to: name(item.to) })).join('; '),
    })
}

/** One page's review table, with what will not be imported, and (CI and CD flows) lanes named for loose steps. */
function PageReview({
  slot,
  page,
  state,
  onState,
  versionId,
  tried,
  current,
}: {
  slot: DiagramSlot
  page: DrawioPage
  /** The diagram imported into (the infrastructure tab's fixed zones) */
  current: Diagram
  state: PageState
  /** Changes the page's review (as a function of the latest one: TRM matches arrive one by one) */
  onState: (change: (state: PageState) => PageState) => void
  versionId?: string
  tried: boolean
}) {
  const { t } = useTranslation()
  const kindLabel = useKindLabel(slot, current)
  const describe = useNotImported()
  const [newLane, setNewLane] = useState('')
  const problems = reviewProblems(slot, page, state.rows, state.lanes, current)
  const message = (problem: RowProblem | undefined, row: ReviewRow) =>
    problem === 'choose'
      ? t('sad.diagram.import.chooseKind')
      : problem === 'place'
        ? t(`sad.diagram.import.places.${PLACE[row.becomes!] ?? row.becomes}`)
        : problem === 'one-each'
          ? t('sad.diagram.import.oneEach', { kind: kindLabel(row.becomes!, true) })
          : undefined
  const loose = stepsWithoutLane(slot, page, state.rows)
  const setRow = (id: string, patch: Partial<ReviewRow>) => onState((latest) => ({ ...latest, rows: latest.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) }))
  // What is listed as not imported assumes the rows still to choose will be imported.
  const assumed = state.rows.map((row) => (row.becomes === null ? { ...row, becomes: kindsFor(slot, row)[0] } : row))
  const notImported = importDiagram(slot, page, assumed, { base: { id: 'review', title: page.name, sizing: 'auto', zones: [], boxes: [], lines: [] }, links: {}, lanes: state.lanes }).notImported
  const laneOptions = [
    ...state.rows.filter((row) => row.container && row.becomes === 'lane').map((row) => ({ value: row.id, label: row.label })),
    ...state.lanes.map((label, index) => ({ value: `new-${index + 1}`, label: t('sad.diagram.import.newLaneOption', { label }) })),
  ]
  const linkable = LINKABLE.some((kind) => kindsFor(slot, { container: false }).includes(kind)) && versionId !== undefined
  return (
    <div className="flex flex-col gap-3">
      <DataTable<ReviewRow>
        caption={t('sad.diagram.import.review', { page: page.name })}
        getRowId={(row) => row.id}
        rows={state.rows}
        emptyState={<p className="p-4 text-sm text-text-subdued">{t('sad.diagram.import.nothing')}</p>}
        columns={[
          { id: 'name', header: t('sad.diagram.name'), accessor: (row) => row.label },
          { id: 'found', header: t('sad.diagram.import.found'), accessor: (row) => (row.icon ? t('sad.diagram.import.azureIcon', { name: azureIconName(row.icon) }) : t(`sad.diagram.import.shapes.${row.shape}`)) },
          {
            id: 'becomes',
            header: t('sad.diagram.import.becomes'),
            cell: (row) => (
              <Dropdown
                label={t('sad.diagram.import.becomesOf', { name: row.label })}
                hideLabel
                placeholder={t('sad.diagram.choose')}
                options={[...kindsFor(slot, row), SKIP].map((kind) => ({ value: kind, label: kindLabel(kind, row.container) }))}
                value={row.becomes}
                onValueChange={(becomes) => setRow(row.id, { becomes })}
                error={tried ? message(problems[row.id], row) : undefined}
              />
            ),
          },
          ...(linkable
            ? [
                {
                  id: 'trm',
                  header: t('sad.diagram.import.trm'),
                  cell: (row: ReviewRow) =>
                    LINKABLE.includes(row.becomes ?? '') ? (
                      <TrmMatch
                        versionId={versionId}
                        row={row}
                        match={state.matches[row.id]}
                        declined={state.declined.includes(row.id)}
                        onMatch={(app) => onState((latest) => ({ ...latest, matches: { ...latest.matches, [row.id]: app } }))}
                        onDecline={(declined) => onState((latest) => ({ ...latest, declined: declined ? [...latest.declined, row.id] : latest.declined.filter((id) => id !== row.id) }))}
                      />
                    ) : (
                      '—'
                    ),
                },
              ]
            : []),
          ...(slot === 'ci-cd'
            ? [
                {
                  id: 'lane',
                  header: t('sad.diagram.lane'),
                  cell: (row: ReviewRow) =>
                    loose.has(row.id) ? (
                      <Dropdown
                        label={t('sad.diagram.import.laneOf', { name: row.label })}
                        hideLabel
                        placeholder={t('sad.diagram.choose')}
                        options={laneOptions}
                        value={row.lane ?? null}
                        onValueChange={(lane) => setRow(row.id, { lane })}
                        error={tried && problems[row.id] === 'lane' ? t('sad.diagram.import.chooseLane') : undefined}
                      />
                    ) : (
                      '—'
                    ),
                },
              ]
            : []),
        ]}
      />
      {notImported.length > 0 && <PageMessage>{describe(notImported)}</PageMessage>}
      {loose.size > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-xs">
            <TextField label={t('sad.diagram.import.newLane')} value={newLane} onChange={(event) => setNewLane(event.target.value)} />
          </div>
          <Button
            variant="secondary"
            disabled={!newLane.trim()}
            onClick={() => {
              onState((latest) => ({ ...latest, lanes: [...latest.lanes, newLane.trim()] }))
              setNewLane('')
            }}
          >
            {t('sad.diagram.addLane')}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Imports a draw.io file into a slot: the file is read in the browser, its pages reviewed (what each container and
 * shape becomes), and nothing changes until Import. The import replaces the diagram on screen (after asking when it
 * has something on it), or, for CI and CD flows and monitoring, may add its pages as new diagrams.
 */
export function DrawioImport({
  slot,
  content,
  current,
  versionId,
  reserved = [],
  onImport,
  onClose,
}: {
  slot: DiagramSlot
  content: Drawn
  current: Diagram
  /** Ids a new diagram may not take (diagrams removed whose files are still kept) */
  reserved?: readonly string[]
  versionId?: string
  /** The new content, the diagrams made (the first is shown), and the file */
  onImport: (next: Drawn, shown: string[], file: File) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const titled = TITLED[slot]
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<DrawioProblem | null>(null)
  const [pages, setPages] = useState<DrawioPage[] | null>(null)
  const [states, setStates] = useState<PageState[]>([])
  const [chosen, setChosen] = useState<number[]>([])
  const [where, setWhere] = useState<'replace' | 'add'>('replace')
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const read = async (file: File) => {
    setPages(null)
    setTried(false)
    const bad = checkFile(file)
    setProblem(bad)
    if (bad) return
    try {
      const found = await readDrawio(await file.text())
      setFile(file)
      setPages(found)
      setStates(found.map((page) => ({ rows: reviewOf(slot, page).rows, lanes: [], matches: {}, declined: [] })))
      setChosen(titled ? found.map((_, index) => index) : [0])
    } catch (error) {
      setProblem((error as DrawioError).reason)
    }
  }

  const replacing = !titled || where === 'replace'
  const count = content.diagrams.length + chosen.length - (replacing ? 1 : 0)
  const blocked = pages && chosen.some((index) => Object.keys(reviewProblems(slot, pages[index], states[index].rows, states[index].lanes, current)).length > 0)
  const stop = !pages ? null : chosen.length === 0 ? 'noPages' : blocked ? 'problems' : count > MAX_DIAGRAMS ? 'tooMany' : null

  const apply = () => {
    const built = (index: number, base: Diagram) => {
      const state = states[index]
      const links = Object.fromEntries(Object.entries(state.matches).filter(([id]) => !state.declined.includes(id)))
      return importDiagram(slot, pages![index], state.rows, { base, links, lanes: state.lanes }).diagram
    }
    let next: Drawn = content
    const shown: string[] = []
    chosen.forEach((index, order) => {
      if (replacing && order === 0) {
        const diagram = built(index, current)
        next = { ...next, diagrams: next.diagrams.map((d) => (d.id === current.id ? diagram : d)) }
        shown.push(diagram.id)
        return
      }
      next = addDiagram(next, pages![index].name, reserved)
      const added = next.diagrams[next.diagrams.length - 1]
      next = { ...next, diagrams: [...next.diagrams.slice(0, -1), built(index, added)] }
      shown.push(added.id)
    })
    onImport(next, shown, file!)
  }

  const importNow = () => {
    setTried(true)
    if (stop) return
    if (replacing && something(current)) setConfirming(true)
    else apply()
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-card border border-border-selected p-4">
      <legend className="px-1 text-base font-semibold">{t('sad.diagram.import.title')}</legend>
      <FileChooser label={t('sad.diagram.import.file')} hint={t('sad.diagram.import.fileHint')} accept=".drawio,.xml" onFile={(file) => void read(file)} />
      {problem && <PageMessage variant="error">{t(`sad.diagram.import.errors.${problem}`)}</PageMessage>}
      {pages && (
        <>
          {titled ? (
            <>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-semibold">{t('sad.diagram.import.pages')}</legend>
                {pages.map((page, index) => (
                  <Checkbox
                    key={index}
                    label={page.name}
                    checked={chosen.includes(index)}
                    onCheckedChange={(on) => setChosen(on ? [...chosen, index].sort((a, b) => a - b) : chosen.filter((item) => item !== index))}
                  />
                ))}
              </fieldset>
              <Segmented
                label={t('sad.diagram.import.where')}
                options={[
                  { value: 'replace', label: t('sad.diagram.import.replace', { title: current.title }) },
                  { value: 'add', label: t('sad.diagram.import.add') },
                ]}
                value={where}
                onChange={setWhere}
              />
            </>
          ) : (
            pages.length > 1 && (
              <div className="w-full max-w-md">
                <Dropdown label={t('sad.diagram.import.page')} options={pages.map((page, index) => ({ value: String(index), label: page.name }))} value={String(chosen[0])} onValueChange={(value) => setChosen([Number(value)])} />
              </div>
            )
          )}
          {chosen.map((index) => (
            <PageReview key={index} slot={slot} page={pages[index]} current={current} state={states[index]} onState={(change) => setStates((all) => all.map((item, at) => (at === index ? change(item) : item)))} versionId={versionId} tried={tried} />
          ))}
          {tried && stop && <PageMessage variant="error">{t(`sad.diagram.import.stops.${stop === 'problems' && slot === 'ci-cd' ? 'problemsLanes' : stop}`)}</PageMessage>}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={importNow} disabled={!pages}>
          {t('sad.diagram.import.import')}
        </Button>
        <Button variant="tertiary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('sad.diagram.import.confirmTitle', { title: current.title })}
        description={t(slot === 'infrastructure' ? 'sad.diagram.import.confirmBodyInfrastructure' : 'sad.diagram.import.confirmBody')}
        confirmLabel={t('sad.diagram.import.confirm')}
        onConfirm={() => {
          setConfirming(false)
          apply()
        }}
      />
    </fieldset>
  )
}
