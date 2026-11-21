import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  DataTable,
  Dropdown,
  PageMessage,
  SearchSelect,
  Textarea,
  TextField,
  type DataTableColumn,
} from "../../../components/qi";
import { useBusinessApplications } from "../queries";
import {
  BLOCK_TYPES,
  DATA_CLASSIFICATIONS,
  type BlockType,
  type Box,
  type BusinessApplication,
  type Diagram,
  type DiagramView,
  type Line,
  type Zone,
} from "../schemas";
import { DiagramCanvas } from "./DiagramCanvas";
import { IconField } from "./IconPicker";
import { boxKind, dataObjects, useKindOf, useLineLabel } from "./labels";
import {
  addBlock,
  addLine,
  addZone,
  autoFit,
  dataFactsLost,
  missingFacts,
  removeItem,
  updateBox,
  updateLine,
} from "./model";
import {
  canvasEdits,
  namesOf,
  TOP,
  zoneOptions,
  type Change,
  type PaneMode,
} from "./helpers";
import { useHiddenRemoval } from "./hidden-removal";
import {
  Facts,
  FormFrame,
  PaneLayout,
  RemoveButton,
  Segmented,
  SelectButton,
  SizingSwitch,
  ZoneFields,
  ZoneForm,
} from "./parts";

/** The Dropdown needs a value for "no classification". */
const NONE = "__none__";
const THIS_APPLICATION = "This application";

/** Finds a TRM application by name or APM number (only those two are shown), for a business application block. */
export function TrmPicker({
  versionId,
  label,
  value = null,
  onPick,
  error,
}: {
  versionId: string;
  label: string;
  value?: BusinessApplication | null;
  onPick: (app: BusinessApplication | null) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const found = useBusinessApplications(versionId, query);
  const ready = query.trim().length >= 2;
  return (
    <SearchSelect<BusinessApplication>
      label={label}
      hint={t("sad.diagram.trmHint")}
      value={value}
      onValueChange={onPick}
      items={ready ? (found.data?.items ?? []) : []}
      onQueryChange={setQuery}
      itemKey={(app) => app.id}
      itemLabel={(app) => app.name}
      itemDescription={(app) => app.number}
      emptyText={
        found.isError
          ? t("sad.diagram.trmFailed")
          : ready
            ? t("sad.diagram.trmNone")
            : t("sad.diagram.trmTypeMore")
      }
      error={error}
    />
  );
}

const directions = (t: (key: string) => string) => [
  { value: "one" as const, label: t("sad.diagram.oneWay") },
  { value: "two" as const, label: t("sad.diagram.twoWayShort") },
];

function BlockForm({
  diagram,
  versionId,
  onAdd,
  onCancel,
}: {
  diagram: Diagram;
  versionId: string;
  onAdd: (box: Parameters<typeof addBlock>[1]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  // Parts of this application go in its grouping box when there is one.
  const ownBox =
    diagram.zones.find((zone) => zone.kind === THIS_APPLICATION)?.id ?? TOP;
  const [type, setType] = useState<BlockType>("part");
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<"trm" | "typed">("trm");
  const [picked, setPicked] = useState<BusinessApplication | null>(null);
  const [parent, setParent] = useState(ownBox);
  const [tried, setTried] = useState(false);
  const fromTrm = type === "business" && source === "trm";
  const parentId = parent === TOP ? undefined : parent;
  return (
    <FormFrame
      title={t("sad.diagram.addBlock")}
      onAdd={() => {
        setTried(true);
        if (fromTrm && picked)
          onAdd({
            label: picked.name,
            type,
            parentId,
            application: { id: picked.id, number: picked.number },
          });
        if (!fromTrm && label.trim()) onAdd({ label, type, parentId });
      }}
      onCancel={onCancel}
    >
      <Dropdown
        label={t("sad.diagram.blockType")}
        options={BLOCK_TYPES.map((value) => ({
          value,
          label: t(`sad.diagram.blocks.${value}`),
        }))}
        value={type}
        onValueChange={(next) => {
          setType(next);
          setParent(next === "part" ? ownBox : TOP);
        }}
      />
      {type === "business" && (
        <Segmented
          label={t("sad.diagram.source")}
          options={[
            { value: "trm", label: t("sad.diagram.findInTrm") },
            { value: "typed", label: t("sad.diagram.typeName") },
          ]}
          value={source}
          onChange={setSource}
        />
      )}
      {fromTrm ? (
        <TrmPicker
          versionId={versionId}
          label={t("sad.diagram.trmApplication")}
          value={picked}
          onPick={setPicked}
          error={tried && !picked ? t("sad.diagram.trmNeeded") : undefined}
        />
      ) : (
        <TextField
          label={t("sad.diagram.name")}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          error={
            tried && !label.trim() ? t("sad.diagram.nameNeeded") : undefined
          }
        />
      )}
      <Dropdown
        label={t("sad.diagram.inside")}
        options={zoneOptions(diagram, t("sad.diagram.notInsideGroup"))}
        value={parent}
        onValueChange={setParent}
      />
    </FormFrame>
  );
}

function ConnectionForm({
  diagram,
  onAdd,
  onCancel,
}: {
  diagram: Diagram;
  onAdd: (line: Parameters<typeof addLine>[1]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [calls, setCalls] = useState("");
  const [does, setDoes] = useState("");
  const [direction, setDirection] = useState<"one" | "two">("one");
  const [tried, setTried] = useState(false);
  const ends = [...diagram.boxes, ...diagram.zones].map((item) => ({
    value: item.id,
    label: item.label,
  }));
  const same = from !== null && from === to;
  return (
    <FormFrame
      title={t("sad.diagram.addConnection")}
      onAdd={() => {
        setTried(true);
        if (from && to && !same)
          onAdd({ from, to, calls, does, twoWay: direction === "two" });
      }}
      onCancel={onCancel}
    >
      <Dropdown
        label={t("sad.diagram.from")}
        placeholder={t("sad.diagram.choose")}
        options={ends}
        value={from}
        onValueChange={setFrom}
        error={tried && !from ? t("sad.diagram.choose") : undefined}
      />
      <Dropdown
        label={t("sad.diagram.to")}
        placeholder={t("sad.diagram.choose")}
        options={ends}
        value={to}
        onValueChange={setTo}
        error={
          same
            ? t("sad.diagram.sameEnds")
            : tried && !to
              ? t("sad.diagram.choose")
              : undefined
        }
      />
      <TextField
        label={t("sad.diagram.calls")}
        hint={t("sad.diagram.callsHint")}
        value={calls}
        onChange={(event) => setCalls(event.target.value)}
      />
      <TextField
        label={t("sad.diagram.does")}
        hint={t("sad.diagram.doesHint")}
        value={does}
        onChange={(event) => setDoes(event.target.value)}
      />
      <Segmented
        label={t("sad.diagram.direction")}
        options={directions(t)}
        value={direction}
        onChange={setDirection}
      />
    </FormFrame>
  );
}

/** What a connection records, read-only: what it calls and does (section 2 readers), its data flow facts (section 9 readers). */
function connectionFacts(
  t: (key: string) => string,
  line: Line,
  { calls, data }: { calls: boolean; data: boolean },
): [string, string][] {
  return [
    ...(calls
      ? ([
          [t("sad.diagram.calls"), line.calls ?? "—"],
          [t("sad.diagram.does"), line.does ?? "—"],
          [
            t("sad.diagram.direction"),
            line.twoWay
              ? t("sad.diagram.twoWayShort")
              : t("sad.diagram.oneWay"),
          ],
        ] as [string, string][])
      : []),
    ...(data
      ? ([
          [t("sad.diagram.dataObjects"), dataObjects(line).join("; ") || "—"],
          [
            t("sad.diagram.classification"),
            line.classification
              ? t(`sad.diagram.classifications.${line.classification}`)
              : "—",
          ],
          [t("sad.diagram.frequency"), line.frequency ?? "—"],
        ] as [string, string][])
      : []),
  ];
}

/** The selected grouping box, block or connection: edited in the Solution view, its data flow facts in the Data flow view, otherwise read-only. */
function SolutionDetails({
  diagram,
  selected,
  mode,
  shows,
  versionId,
  change,
  onRemoved,
}: {
  diagram: Diagram;
  selected: string | null;
  mode: PaneMode;
  shows: { calls: boolean; data: boolean };
  versionId?: string;
  change?: Change;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const kindOf = useKindOf();
  const hiddenRemoval = useHiddenRemoval(diagram, selected);
  const name = namesOf(diagram);
  const zone = diagram.zones.find((z) => z.id === selected);
  const box = diagram.boxes.find((b) => b.id === selected);
  const line = diagram.lines.find((l) => l.id === selected);
  if (!zone && !box && !line)
    return (
      <p className="text-sm text-text-subdued">{t("sad.diagram.selectHint")}</p>
    );
  const notInside = t("sad.diagram.notInsideGroup");
  const heading = line
    ? `${name(line.from)} → ${name(line.to)}`
    : (zone ?? box)!.label;
  const inside = (item: Zone | Box) => name(item.parentId) || notInside;

  if (line && mode === "facts") {
    const needed = missingFacts("data-flow", line);
    return (
      <div className="flex flex-col gap-3">
        <Facts
          heading={heading}
          facts={connectionFacts(t, line, { calls: shows.calls, data: false })}
        />
        <Textarea
          key={`${line.id}-data`}
          label={t("sad.diagram.dataObjects")}
          hint={t("sad.diagram.dataHint")}
          rows={3}
          value={line.data ?? ""}
          onChange={(event) =>
            change!((d) => updateLine(d, line.id, { data: event.target.value }))
          }
        />
        <Dropdown
          label={t("sad.diagram.classification")}
          options={[
            { value: NONE, label: t("sad.diagram.notSet") },
            ...DATA_CLASSIFICATIONS.map((value) => ({
              value,
              label: t(`sad.diagram.classifications.${value}`),
            })),
          ]}
          value={line.classification ?? NONE}
          onValueChange={(value) =>
            change!((d) =>
              updateLine(d, line.id, {
                classification:
                  value === NONE
                    ? undefined
                    : (value as Line["classification"]),
              }),
            )
          }
          error={
            needed.includes("classification")
              ? t("sad.diagram.classificationNeeded")
              : undefined
          }
        />
        <TextField
          key={`${line.id}-frequency`}
          label={t("sad.diagram.frequency")}
          hint={t("sad.diagram.frequencyHint")}
          value={line.frequency ?? ""}
          onChange={(event) =>
            change!((d) =>
              updateLine(d, line.id, { frequency: event.target.value }),
            )
          }
          error={
            needed.includes("frequency")
              ? t("sad.diagram.frequencyNeeded")
              : undefined
          }
        />
      </div>
    );
  }
  if (mode !== "draw") {
    const facts: [string, string][] = line
      ? connectionFacts(t, line, shows)
      : zone
        ? [
            [t("sad.diagram.kind"), zone.kind ?? "—"],
            [t("sad.diagram.inside"), inside(zone)],
          ]
        : [
            [t("sad.diagram.blockType"), kindOf(boxKind(box!))],
            [t("sad.diagram.inside"), inside(box!)],
          ];
    return <Facts heading={heading} facts={facts} />;
  }

  const edit = change!;
  const remove = (confirm: string) => (
    <RemoveButton
      confirm={
        hiddenRemoval.confirm ??
        (dataFactsLost(diagram, selected!)
          ? { title: t("sad.diagram.removeFactsTitle"), description: confirm }
          : undefined)
      }
      onRemove={() => {
        edit((d) => removeItem(d, selected!));
        onRemoved();
      }}
    />
  );
  const nameField = (item: Box) => (
    <TextField
      key={`${item.id}-label`}
      label={t("sad.diagram.name")}
      value={item.label}
      error={item.label.trim() ? undefined : t("sad.diagram.nameNeeded")}
      onChange={(event) =>
        edit((d) => updateBox(d, item.id, { label: event.target.value }))
      }
    />
  );
  const pick = (item: Box) => (app: BusinessApplication | null) =>
    app &&
    edit((d) =>
      updateBox(d, item.id, {
        label: app.name,
        application: { id: app.id, number: app.number },
      }),
    );
  const ends = [...diagram.boxes, ...diagram.zones].map((item) => ({
    value: item.id,
    label: item.label,
  }));
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-base font-semibold">{heading}</h4>
      {zone && (
        <>
          <ZoneFields
            diagram={diagram}
            zone={zone}
            notInside={notInside}
            change={edit}
          />
          {remove(t("sad.diagram.removeBlockFacts", { name: zone.label }))}
        </>
      )}
      {box && (
        <>
          <Dropdown
            label={t("sad.diagram.blockType")}
            options={BLOCK_TYPES.map((value) => ({
              value,
              label: t(`sad.diagram.blocks.${value}`),
            }))}
            value={box.type as BlockType}
            onValueChange={(type) =>
              edit((d) => updateBox(d, box.id, { type }))
            }
          />
          {box.type === "business" && box.application ? (
            <>
              <p className="text-sm">
                {t("sad.diagram.fromTrm", {
                  name: box.label,
                  number: box.application.number,
                })}
              </p>
              <TrmPicker
                key={`${box.id}-repick`}
                versionId={versionId!}
                label={t("sad.diagram.pickAnother")}
                onPick={pick(box)}
              />
              <Button
                variant="tertiary"
                onClick={() =>
                  edit((d) => updateBox(d, box.id, { application: undefined }))
                }
              >
                {t("sad.diagram.unlink")}
              </Button>
            </>
          ) : (
            nameField(box)
          )}
          {box.type === "business" && !box.application && (
            <TrmPicker
              key={`${box.id}-link`}
              versionId={versionId!}
              label={t("sad.diagram.linkToTrm")}
              onPick={pick(box)}
            />
          )}
          <IconField box={box} change={edit} />
          <Dropdown
            label={t("sad.diagram.inside")}
            options={zoneOptions(diagram, notInside)}
            value={box.parentId ?? TOP}
            onValueChange={(value) =>
              edit((d) =>
                updateBox(d, box.id, {
                  parentId: value === TOP ? undefined : value,
                }),
              )
            }
          />
          {remove(t("sad.diagram.removeBlockFacts", { name: box.label }))}
        </>
      )}
      {line && (
        <>
          <Dropdown
            label={t("sad.diagram.from")}
            options={ends.filter((end) => end.value !== line.to)}
            value={line.from}
            onValueChange={(from) =>
              edit((d) => updateLine(d, line.id, { from }))
            }
          />
          <Dropdown
            label={t("sad.diagram.to")}
            options={ends.filter((end) => end.value !== line.from)}
            value={line.to}
            onValueChange={(to) => edit((d) => updateLine(d, line.id, { to }))}
          />
          <TextField
            key={`${line.id}-calls`}
            label={t("sad.diagram.calls")}
            hint={t("sad.diagram.callsHint")}
            value={line.calls ?? ""}
            onChange={(event) =>
              edit((d) => updateLine(d, line.id, { calls: event.target.value }))
            }
          />
          <TextField
            key={`${line.id}-does`}
            label={t("sad.diagram.does")}
            hint={t("sad.diagram.doesHint")}
            value={line.does ?? ""}
            onChange={(event) =>
              edit((d) => updateLine(d, line.id, { does: event.target.value }))
            }
          />
          <Segmented
            label={t("sad.diagram.direction")}
            options={directions(t)}
            value={line.twoWay ? "two" : "one"}
            onChange={(direction) =>
              edit((d) =>
                updateLine(d, line.id, { twoWay: direction === "two" }),
              )
            }
          />
          {shows.data && (
            <Facts
              heading={t("sad.diagram.dataFlowFacts")}
              facts={connectionFacts(t, line, { calls: false, data: true })}
            />
          )}
          {remove(t("sad.diagram.removeLineFacts"))}
        </>
      )}
    </div>
  );
}

/** Before submit: connections still missing the view's required facts (warning), and, in the Data flow view, those without data objects (information). */
function FactNotes({ diagram, view }: { diagram: Diagram; view: DiagramView }) {
  const { t } = useTranslation();
  const name = namesOf(diagram);
  const ends = (line: Line) => `${name(line.from)} → ${name(line.to)}`;
  const missing = diagram.lines
    .map((line) => [line, missingFacts(view, line)] as const)
    .filter(([, keys]) => keys.length > 0);
  const noData =
    view === "data-flow"
      ? diagram.lines.filter((line) => dataObjects(line).length === 0)
      : [];
  return (
    <>
      {missing.length > 0 && (
        <PageMessage
          variant="warning"
          title={t(`sad.diagram.missingTitle.${view}`)}
        >
          <ul className="list-disc pl-5">
            {missing.map(([line, keys]) => (
              <li key={line.id}>
                {ends(line)}:{" "}
                {keys.map((key) => t(`sad.diagram.missing.${key}`)).join(", ")}
              </li>
            ))}
          </ul>
        </PageMessage>
      )}
      {noData.length > 0 && (
        <PageMessage title={t("sad.diagram.noDataTitle")}>
          {t("sad.diagram.noDataBody", { list: noData.map(ends).join("; ") })}
        </PageMessage>
      )}
    </>
  );
}

/** The grouping boxes (Solution view), blocks and connections: the keyboard and screen-reader way to select and read them. */
function SolutionTables({
  diagram,
  view,
  shows,
  select,
}: {
  diagram: Diagram;
  view: DiagramView;
  shows: { calls: boolean; data: boolean };
  select: (id: string) => void;
}) {
  const { t } = useTranslation();
  const kindOf = useKindOf();
  const name = namesOf(diagram);
  const inside = (item: Zone | Box) => name(item.parentId) || "—";
  const empty = (key: string) => (
    <p className="p-4 text-sm text-text-subdued">{t(key)}</p>
  );
  const solutionView = view === "solution";
  const callColumns: DataTableColumn<Line>[] = [
    {
      id: "calls",
      header: t("sad.diagram.calls"),
      accessor: (line) => line.calls ?? "—",
    },
    ...(solutionView
      ? ([
          {
            id: "does",
            header: t("sad.diagram.does"),
            accessor: (line) => line.does ?? "—",
          },
          {
            id: "direction",
            header: t("sad.diagram.direction"),
            accessor: (line) =>
              line.twoWay
                ? t("sad.diagram.twoWayShort")
                : t("sad.diagram.oneWay"),
          },
        ] as DataTableColumn<Line>[])
      : []),
  ];
  const dataColumns: DataTableColumn<Line>[] = [
    {
      id: "data",
      header: t("sad.diagram.dataObjects"),
      accessor: (line) => dataObjects(line).join("; ") || "—",
    },
    {
      id: "classification",
      header: t("sad.diagram.classification"),
      accessor: (line) =>
        line.classification
          ? t(`sad.diagram.classifications.${line.classification}`)
          : "—",
    },
    {
      id: "frequency",
      header: t("sad.diagram.frequency"),
      accessor: (line) => line.frequency ?? "—",
    },
  ];
  return (
    <>
      {solutionView && (
        <DataTable<Zone>
          caption={t("sad.diagram.groups")}
          getRowId={(zone) => zone.id}
          rows={diagram.zones}
          emptyState={empty("sad.diagram.noGroups")}
          columns={[
            {
              id: "name",
              header: t("sad.diagram.name"),
              cell: (zone) => (
                <SelectButton onClick={() => select(zone.id)}>
                  {zone.label}
                </SelectButton>
              ),
            },
            {
              id: "kind",
              header: t("sad.diagram.kind"),
              accessor: (zone) => zone.kind ?? "—",
            },
            { id: "inside", header: t("sad.diagram.inside"), accessor: inside },
          ]}
        />
      )}
      <DataTable<Box>
        caption={t("sad.diagram.blocksTable")}
        getRowId={(box) => box.id}
        rows={diagram.boxes}
        emptyState={empty("sad.diagram.noBlocks")}
        columns={[
          {
            id: "name",
            header: t("sad.diagram.name"),
            cell: (box) => (
              <SelectButton onClick={() => select(box.id)}>
                {box.label}
              </SelectButton>
            ),
          },
          {
            id: "type",
            header: t("sad.diagram.blockType"),
            accessor: (box) => kindOf(boxKind(box)),
          },
          { id: "inside", header: t("sad.diagram.inside"), accessor: inside },
        ]}
      />
      <DataTable<Line>
        caption={t("sad.diagram.connections")}
        getRowId={(line) => line.id}
        rows={diagram.lines}
        emptyState={empty("sad.diagram.noConnections")}
        columns={[
          {
            id: "ends",
            header: `${t("sad.diagram.from")} → ${t("sad.diagram.to")}`,
            cell: (line) => (
              <SelectButton onClick={() => select(line.id)}>
                {name(line.from)} → {name(line.to)}
              </SelectButton>
            ),
          },
          ...(shows.calls ? callColumns : []),
          ...(solutionView ? [] : dataColumns),
        ]}
      />
    </>
  );
}

/** Section 2's logical communication matrix, generated from the solution diagram: the data columns only for readers of section 9. */
function LogicalMatrix({ diagram, data }: { diagram: Diagram; data: boolean }) {
  const { t } = useTranslation();
  const name = namesOf(diagram);
  const columns: DataTableColumn<Line>[] = [
    {
      id: "source",
      header: t("sad.diagram.sourceColumn"),
      accessor: (line) => name(line.from),
    },
    {
      id: "destination",
      header: t("sad.diagram.destination"),
      accessor: (line) => name(line.to),
    },
    {
      id: "calls",
      header: t("sad.diagram.calls"),
      accessor: (line) => line.calls ?? "—",
    },
    {
      id: "does",
      header: t("sad.diagram.does"),
      accessor: (line) => line.does ?? "—",
    },
    {
      id: "direction",
      header: t("sad.diagram.direction"),
      accessor: (line) =>
        line.twoWay ? t("sad.diagram.twoWayShort") : t("sad.diagram.oneWay"),
    },
    ...(data
      ? ([
          {
            id: "data",
            header: t("sad.diagram.dataObjects"),
            accessor: (line) => dataObjects(line).join("; ") || "—",
          },
          {
            id: "classification",
            header: t("sad.diagram.classification"),
            accessor: (line) =>
              line.classification
                ? t(`sad.diagram.classifications.${line.classification}`)
                : "—",
          },
          {
            id: "frequency",
            header: t("sad.diagram.frequency"),
            accessor: (line) => line.frequency ?? "—",
          },
        ] as DataTableColumn<Line>[])
      : []),
  ];
  return (
    <DataTable<Line>
      caption={t("sad.diagram.logicalMatrix")}
      getRowId={(line) => line.id}
      rows={diagram.lines}
      emptyState={
        <p className="p-4 text-sm text-text-subdued">
          {t("sad.diagram.noConnections")}
        </p>
      }
      columns={columns}
    />
  );
}

/**
 * The solution diagram in one view. Section 2 draws it (Solution view, with the logical matrix); section 9 records
 * its connections' data flow facts (Data flow view); everyone else reads it.
 */
export function SolutionPane({
  diagram,
  view,
  mode,
  readableViews,
  versionId,
  onChange,
}: {
  diagram: Diagram;
  view: DiagramView;
  mode: PaneMode;
  readableViews: readonly DiagramView[];
  /** The draft, for finding business applications in TRM */
  versionId?: string;
  onChange?: (diagram: Diagram) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<"group" | "block" | "connection" | null>(
    null,
  );
  const lineLabel = useLineLabel(view);
  const drawing = mode === "draw";
  const change: Change | undefined =
    onChange &&
    ((fn, options) =>
      onChange(
        drawing
          ? autoFit(fn(diagram), { push: !options?.dragging })
          : fn(diagram),
      ));
  const shows = {
    calls: readableViews.includes("solution"),
    data: readableViews.includes("data-flow"),
  };
  const added = (d: Diagram, kind: "zones" | "boxes" | "lines") => {
    change!(() => d);
    setSelected(d[kind][d[kind].length - 1].id);
    setForm(null);
  };
  const cancel = () => setForm(null);
  return (
    <div className="flex flex-col gap-4">
      <PaneLayout
        toolbar={
          drawing && (
            <>
              <Button variant="secondary" onClick={() => setForm("group")}>
                {t("sad.diagram.addGroup")}
              </Button>
              <Button variant="secondary" onClick={() => setForm("block")}>
                {t("sad.diagram.addBlock")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setForm("connection")}
                disabled={diagram.zones.length + diagram.boxes.length < 2}
              >
                {t("sad.diagram.addConnection")}
              </Button>
              <SizingSwitch diagram={diagram} change={change!} />
            </>
          )
        }
        form={
          drawing &&
          {
            group: (
              <ZoneForm
                diagram={diagram}
                title={t("sad.diagram.addGroup")}
                kindHint={t("sad.diagram.groupKindHint")}
                notInside={t("sad.diagram.notInsideGroup")}
                onCancel={cancel}
                onAdd={(zone) => added(addZone(diagram, zone), "zones")}
              />
            ),
            block: (
              <BlockForm
                diagram={diagram}
                versionId={versionId!}
                onCancel={cancel}
                onAdd={(box) => added(addBlock(diagram, box), "boxes")}
              />
            ),
            connection: (
              <ConnectionForm
                diagram={diagram}
                onCancel={cancel}
                onAdd={(line) => added(addLine(diagram, line), "lines")}
              />
            ),
            none: null,
          }[form ?? "none"]
        }
        notes={mode !== "read" && <FactNotes diagram={diagram} view={view} />}
        canvas={
          <DiagramCanvas
            diagram={diagram}
            editable={drawing}
            selected={selected}
            onSelect={setSelected}
            onEdits={canvasEdits(diagram, change, setSelected)}
            lineLabel={lineLabel}
          />
        }
        hint={t(
          `sad.diagram.${{ draw: "canvasHint", facts: "canvasHintFacts", read: "canvasHintReadOnly" }[mode]}`,
        )}
        details={
          <SolutionDetails
            diagram={diagram}
            selected={selected}
            mode={mode}
            shows={shows}
            versionId={versionId}
            change={change}
            onRemoved={() => setSelected(null)}
          />
        }
        tables={
          <SolutionTables
            diagram={diagram}
            view={view}
            shows={shows}
            select={setSelected}
          />
        }
      />
      {view === "solution" && (
        <LogicalMatrix diagram={diagram} data={shows.data} />
      )}
    </div>
  );
}
