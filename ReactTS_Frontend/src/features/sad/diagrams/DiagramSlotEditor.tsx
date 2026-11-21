import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/page/ConfirmDialog";
import { Button, Tabs, Textarea, TextField } from "../../../components/qi";
import { useUploads } from "../queries";
import {
  DIAGRAM_VIEWS,
  type Box,
  type Diagram,
  type DiagramApi,
  type DiagramContent,
  type DiagramSlot,
  type DiagramSlotData,
  type DiagramView,
  type Hosting,
} from "../schemas";
import {
  addDiagram,
  emptyContent,
  removeDiagram,
  updateDiagram,
} from "./model";
import { type PaneMode } from "./helpers";
import { OWNER_VIEW, TITLED } from "./shapes";
import { HostingFields } from "./HostingFields";
import { applyHosting, DEFAULT_HOSTING } from "./infrastructure";
import { CopyFromProduction, InfrastructurePane } from "./InfrastructurePane";
import { DiagramFiles } from "./DiagramFiles";
import { TechnicalMatrix } from "./integration";
import { DrawioImport } from "./drawio/DrawioImport";
import { HiddenContext } from "./hidden-removal";
import { MonitoringPane } from "./MonitoringPane";
import { ProcessPane } from "./ProcessPane";
import { SolutionPane } from "./solution";

type Drawn = { diagrams: Diagram[]; hosting?: Hosting };

/** What the API says an editor cannot see of a slot (per diagram), what they edit, and which section each view belongs to. */
export interface HiddenFromEditor {
  parts: DiagramSlotData["hidden"];
  editableViews: readonly DiagramView[];
  sectionOf: (view: DiagramView) => string;
}
const NOTHING_HIDDEN: HiddenFromEditor = {
  parts: [],
  editableViews: [],
  sectionOf: () => "",
};

/** The diagrams of a slot: one, two fixed infrastructure tabs, or several titled ones. */
function Drawing({
  slot,
  view,
  mode,
  readableViews,
  versionId,
  offered,
  apis,
  content,
  onChange,
  savedDiagramIds,
  onImported,
  hidden,
}: {
  slot: DiagramSlot;
  view: DiagramView;
  mode: PaneMode;
  readableViews: readonly DiagramView[];
  versionId?: string;
  offered: Box[];
  apis: DiagramApi[];
  content: Drawn;
  onChange?: (content: Drawn) => void;
  savedDiagramIds: readonly string[];
  onImported?: (file: File, diagramIds: string[]) => void;
  hidden: HiddenFromEditor;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(content.diagrams[0].id);
  const [removing, setRemoving] = useState(false);
  const uploads = useUploads(versionId);
  const slotUploads = (uploads.data?.items ?? []).filter(
    (item) => item.slot === slot,
  );
  const filesOf = (diagramId: string) =>
    slotUploads.filter((item) => item.diagramId === diagramId).length;
  // Files of a removed diagram stay until the slot is saved: a new diagram must not take its id.
  const reserved = slotUploads.map((item) => item.diagramId);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const diagram =
    content.diagrams.find((d) => d.id === current) ?? content.diagrams[0];
  const slotName = t(`sad.diagram.slots.${slot}`);
  const changeDiagram =
    onChange &&
    ((next: Diagram) =>
      onChange({
        ...content,
        diagrams: content.diagrams.map((d) => (d.id === next.id ? next : d)),
      }));
  const pane =
    slot === "solution" ? (
      <SolutionPane
        key={diagram.id}
        diagram={diagram}
        view={view}
        mode={mode}
        readableViews={readableViews}
        versionId={versionId}
        onChange={changeDiagram}
      />
    ) : slot === "infrastructure" ? (
      <div key={diagram.id} className="flex flex-col gap-4">
        {mode === "draw" && diagram.tab === "non-production" && (
          <CopyFromProduction content={content} onChange={onChange!} />
        )}
        <InfrastructurePane
          diagram={diagram}
          view={view}
          mode={mode}
          versionId={versionId}
          offered={offered}
          apis={apis}
          onChange={changeDiagram}
        />
      </div>
    ) : slot === "ci-cd" ? (
      <ProcessPane
        key={diagram.id}
        diagram={diagram}
        mode={mode}
        onChange={changeDiagram}
      />
    ) : (
      <MonitoringPane
        key={diagram.id}
        diagram={diagram}
        mode={mode}
        versionId={versionId}
        onChange={changeDiagram}
      />
    );
  const importer = mode === "draw" && onChange && (
    <div className="flex flex-col gap-3">
      {!importing && (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setImporting(true);
              setImported(null);
            }}
          >
            {t("sad.diagram.import.button")}
          </Button>
        </div>
      )}
      {imported && (
        <p role="status" className="text-sm">
          {t("sad.diagram.import.done", { file: imported })}
        </p>
      )}
      {importing && (
        <DrawioImport
          slot={slot}
          content={content}
          reserved={reserved}
          current={diagram}
          versionId={versionId}
          onImport={(next, shown, file) => {
            onChange(next);
            setCurrent(shown[0]);
            setImporting(false);
            setImported(file.name);
            // The draw.io file is kept under each diagram it made, once they are saved.
            onImported?.(file, shown);
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
  const onDiagram = {
    carriers:
      hidden.parts.find((part) => part.diagramId === diagram.id)?.carriers ??
      [],
    editableViews: hidden.editableViews,
    sectionOf: hidden.sectionOf,
  };
  const shown = (
    <div className="flex flex-col gap-4">
      {importer}
      <HiddenContext.Provider value={onDiagram}>{pane}</HiddenContext.Provider>
      {versionId && (
        <DiagramFiles
          key={`files-${diagram.id}`}
          versionId={versionId}
          slot={slot}
          diagramId={diagram.id}
          editable={mode === "draw"}
          saved={savedDiagramIds.includes(diagram.id)}
        />
      )}
    </div>
  );
  if (content.diagrams.length === 1 && !(TITLED[slot] && onChange))
    return shown;
  const titled = TITLED[slot];
  const removeDiagramNow = () => {
    const next = removeDiagram(content, diagram.id);
    onChange!(next);
    setCurrent(next.diagrams[0].id);
  };
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label={t("sad.diagram.diagrams", { slot: slotName })}
        tabs={content.diagrams.map((d) => ({
          value: d.id,
          label: d.tab ? t(`sad.diagram.tabs.${d.tab}`) : d.title || "—",
        }))}
        value={diagram.id}
        onValueChange={setCurrent}
      >
        <div className="flex flex-col gap-4">
          {titled && onChange && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full max-w-md">
                <TextField
                  key={`${diagram.id}-title`}
                  label={t("sad.diagram.diagramTitle")}
                  value={diagram.title}
                  error={
                    diagram.title.trim()
                      ? undefined
                      : t("sad.diagram.titleNeeded")
                  }
                  onChange={(event) =>
                    onChange(
                      updateDiagram(content, diagram.id, {
                        title: event.target.value,
                      }),
                    )
                  }
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  const next = addDiagram(
                    content,
                    t("sad.diagram.newDiagram"),
                    reserved,
                  );
                  onChange(next);
                  setCurrent(next.diagrams[next.diagrams.length - 1].id);
                }}
              >
                {t("sad.diagram.addDiagram")}
              </Button>
              {content.diagrams.length > 1 && (
                <Button
                  variant="tertiary"
                  onClick={() =>
                    filesOf(diagram.id) > 0
                      ? setRemoving(true)
                      : removeDiagramNow()
                  }
                >
                  {t("sad.diagram.removeDiagram")}
                </Button>
              )}
              <ConfirmDialog
                open={removing}
                onClose={() => setRemoving(false)}
                title={t("sad.diagram.files.removeDiagramTitle", {
                  title: diagram.title,
                  count: filesOf(diagram.id),
                })}
                description={t("sad.diagram.files.removeDiagramBody")}
                confirmLabel={t("sad.diagram.remove")}
                onConfirm={() => {
                  setRemoving(false);
                  removeDiagramNow();
                }}
              />
            </div>
          )}
          {shown}
        </div>
      </Tabs>
    </div>
  );
}

/**
 * A diagram slot as a section shows it, in one view: drawn here by the section that owns it (with Not applicable),
 * its own facts recorded here (the solution diagram's data flow view in section 9), or read-only.
 */
export function DiagramSlotEditor({
  slot,
  view = OWNER_VIEW[slot],
  content,
  onChange,
  drawnIn,
  error,
  readableViews = DIAGRAM_VIEWS,
  versionId,
  application,
  offered = [],
  apis = [],
  savedDiagramIds = [],
  onImported,
  hidden = NOTHING_HIDDEN,
}: {
  slot: DiagramSlot;
  view?: DiagramView;
  content: DiagramContent;
  /** Present where the caller edits this view */
  onChange?: (content: DiagramContent) => void;
  /** The section that draws it, when shown here in another section or view */
  drawnIn?: string;
  error?: string;
  /** Views whose facts the reader sees (all of them when left out) */
  readableViews?: readonly DiagramView[];
  /** The draft, for finding business applications in TRM */
  versionId?: string;
  /** The SAD's application: a new solution diagram starts with its grouping box */
  application?: string | null;
  /** Business applications on the solution diagram, offered first for the infrastructure diagram */
  offered?: Box[];
  /** The API inventory's APIs by name, which integration connections link to */
  apis?: DiagramApi[];
  /** The diagrams of the slot as saved (files can be added to those only) */
  savedDiagramIds?: readonly string[];
  /** An imported draw.io file, to keep under the diagrams it made once they are saved */
  onImported?: (file: File, diagramIds: string[]) => void;
  /** What the editor cannot see of this slot (for asking before removing what carries it) */
  hidden?: HiddenFromEditor;
}) {
  const { t } = useTranslation();
  const [kept, setKept] = useState<Drawn | null>(null);
  const [confirmingNotApplicable, setConfirmingNotApplicable] = useState(false);
  const uploads = useUploads(versionId);
  const slotFiles = (uploads.data?.items ?? []).filter(
    (item) => item.slot === slot,
  ).length;
  const slotName = t(`sad.diagram.slots.${slot}`);
  // Another view of a slot is named by its view, so a page showing both views tells them apart.
  const title =
    view === OWNER_VIEW[slot]
      ? slotName
      : t("sad.diagram.inView", {
          slot: slotName,
          view: t(`sad.diagram.views.${view}`),
        });
  const notApplicable = "notApplicable" in content;
  const mode: PaneMode = !onChange
    ? "read"
    : view === OWNER_VIEW[slot]
      ? "draw"
      : "facts";
  // The infrastructure diagram's fixed zones follow its hosting settings after every change.
  const commit =
    onChange &&
    ((next: DiagramContent) =>
      onChange(slot === "infrastructure" ? applyHosting(next) : next));
  const drawing = mode === "draw" ? commit : undefined;
  const notApplicableNow = () => {
    setKept(content as Drawn);
    drawing!({ notApplicable: true, reason: "" });
  };
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-card border border-divider-default p-4"
    >
      <h4 className="heading-4">{title}</h4>
      {mode !== "draw" && drawnIn && (
        <p className="text-sm text-text-subdued">
          {mode === "facts"
            ? t(`sad.diagram.factsHere.${view}`, { section: drawnIn })
            : t("sad.diagram.shownFrom", { section: drawnIn })}
        </p>
      )}
      {drawing && (
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">
            {t("sad.diagram.answerLegend", { slot: slotName })}
          </legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`answer-${slot}`}
              checked={!notApplicable}
              onChange={() => drawing(kept ?? emptyContent(slot, application))}
              className="size-4 accent-icon-selected"
            />
            {t("sad.diagram.drawn")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={`answer-${slot}`}
              checked={notApplicable}
              onChange={() =>
                slotFiles > 0
                  ? setConfirmingNotApplicable(true)
                  : notApplicableNow()
              }
              className="size-4 accent-icon-selected"
            />
            {t("sad.diagram.notApplicable")}
          </label>
          <ConfirmDialog
            open={confirmingNotApplicable}
            onClose={() => setConfirmingNotApplicable(false)}
            title={t("sad.diagram.files.notApplicableTitle", {
              count: slotFiles,
            })}
            description={t("sad.diagram.files.notApplicableBody")}
            confirmLabel={t("sad.diagram.notApplicable")}
            onConfirm={() => {
              setConfirmingNotApplicable(false);
              notApplicableNow();
            }}
          />
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-text-error">
          {error}
        </p>
      )}
      {notApplicable ? (
        drawing ? (
          <div className="max-w-2xl">
            <Textarea
              label={t("sad.diagram.reason")}
              value={content.reason}
              onChange={(event) =>
                drawing({ notApplicable: true, reason: event.target.value })
              }
              error={
                content.reason.trim()
                  ? undefined
                  : t("sad.diagram.reasonNeeded")
              }
              rows={3}
            />
          </div>
        ) : (
          <p>
            {t("sad.diagram.notApplicableShown", { reason: content.reason })}
          </p>
        )
      ) : (
        <>
          {slot === "infrastructure" && drawing && (
            <fieldset className="flex max-w-3xl flex-col gap-3 rounded-card border border-divider-default p-4">
              <legend className="px-1 text-base font-semibold">
                {t("sad.diagram.hosting")}
              </legend>
              <p className="text-sm text-text-subdued">
                {t("sad.diagram.hostingHint")}
              </p>
              <HostingFields
                value={content.hosting ?? DEFAULT_HOSTING}
                onChange={(hosting) => drawing({ ...content, hosting })}
                showProblems
              />
            </fieldset>
          )}
          <Drawing
            slot={slot}
            view={view}
            mode={mode}
            readableViews={readableViews}
            versionId={versionId}
            offered={offered}
            apis={apis}
            content={content}
            onChange={commit as ((content: Drawn) => void) | undefined}
            savedDiagramIds={savedDiagramIds}
            onImported={onImported}
            hidden={hidden}
          />
          {slot === "infrastructure" && view === "integration" && (
            <TechnicalMatrix diagrams={content.diagrams} apis={apis} />
          )}
        </>
      )}
    </section>
  );
}
