import { Fragment, useMemo } from 'react'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { IncomingCalls } from '../calls/CallsViews'
import type { DiagramApi, DiagramContent, DiagramRef, DiagramSlot, DiagramSlotData, DiagramView, SadSectionKey, Template } from '../schemas'
import { DiagramSlotEditor } from './DiagramSlotEditor'
import { forEditing } from './editing'
import { drawsHere, VIEW_SECTION } from './shapes'

/**
 * The diagrams a template group shows, each in its view: drawn here when this section owns the slot, its own facts
 * recorded here (the data flow view), or read-only naming the section that draws it. The caller's views decide what
 * they edit and which facts they see; slots they cannot see are left out. The solution view is followed by the calls to
 * the application that other applications' approved SADs describe.
 */
export function GroupDiagrams({
  refs,
  section,
  template,
  slots,
  drafts = {},
  onChange,
  errors = {},
  versionId,
  application,
  applicationId,
  apis,
  onImported,
  load,
}: {
  refs: DiagramRef[]
  section: SadSectionKey
  template: Template
  slots: DiagramSlotData[] | undefined
  drafts?: Partial<Record<DiagramSlot, DiagramContent>>
  /** Present in the section editor */
  onChange?: (slot: DiagramSlot, content: DiagramContent) => void
  errors?: Partial<Record<DiagramSlot, string>>
  /** The draft, for finding business applications in TRM */
  versionId?: string
  /** The SAD's application, for a new solution diagram's grouping box */
  application?: string | null
  /** The SAD's application in TRM, for the calls other applications' SADs describe */
  applicationId?: string
  /** The API inventory's APIs by name, which integration connections link to */
  apis?: DiagramApi[]
  /** An imported draw.io file, to keep under the diagrams it made once the slot is saved */
  onImported?: (slot: DiagramSlot, file: File, diagramIds: string[]) => void
  /** Loading the slots failed: shown with a way to try again (until they arrive, a loading state) */
  load?: { failed: boolean; retry: () => void }
}) {
  // Saved content as the editor keeps it (with the ids new items must not take).
  const saved = useMemo(() => new Map((slots ?? []).map((slot) => [slot.slot, forEditing(slot)])), [slots])
  const sectionOf = (view: DiagramView) => template.sections.find((s) => s.key === VIEW_SECTION[view])!.title
  // The solution diagram's business applications are offered first on the infrastructure diagram.
  const solution = drafts.solution ?? slots?.find((slot) => slot.slot === 'solution')?.content
  const offered = solution && 'diagrams' in solution ? solution.diagrams.flatMap((d) => d.boxes.filter((box) => box.type === 'business')) : []
  if (refs.length > 0 && !slots) return load?.failed ? <LoadFailed onRetry={load.retry} /> : <Loading />
  return refs.map((ref) => {
    const data = slots?.find((slot) => slot.slot === ref.slot)
    if (!data) return null
    const owned = drawsHere(ref.slot, ref.view, data.owner, section)
    return (
      <Fragment key={`${ref.slot}-${ref.view}`}>
        <DiagramSlotEditor
          slot={ref.slot}
          view={ref.view}
          content={drafts[ref.slot] ?? saved.get(ref.slot)!}
          // Edited only in the section that edits this view (section 4 shows the infrastructure view read-only).
          onChange={onChange && data.editableViews.includes(ref.view) && VIEW_SECTION[ref.view] === section ? (content) => onChange(ref.slot, content) : undefined}
          drawnIn={owned ? undefined : template.sections.find((s) => s.key === data.owner)!.title}
          error={errors[ref.slot]}
          readableViews={data.readableViews}
          versionId={versionId}
          application={application}
          offered={offered}
          apis={apis}
          // Files are added only to diagrams that are saved (a slot never saved holds none yet).
          savedDiagramIds={data.rowVersion === 0 || 'notApplicable' in data.content ? [] : data.content.diagrams.map((diagram) => diagram.id)}
          onImported={onImported && ((file, diagramIds) => onImported(ref.slot, file, diagramIds))}
          hidden={{ parts: data.hidden, editableViews: data.editableViews, sectionOf }}
        />
        {applicationId && ref.slot === 'solution' && ref.view === 'solution' && <IncomingCalls applicationId={applicationId} />}
      </Fragment>
    )
  })
}
