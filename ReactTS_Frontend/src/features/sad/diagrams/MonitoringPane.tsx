import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DataTable, Dropdown, TextField } from "../../../components/qi";
import type { Box, BusinessApplication, Diagram, Line, Zone } from "../schemas";
import { DiagramCanvas } from "./DiagramCanvas";
import {
  canvasEdits,
  lineStyle,
  namesOf,
  TOP,
  zoneOptions,
  type Change,
  type PaneMode,
} from "./helpers";
import { IconField } from "./IconPicker";
import { boxKind, useKindOf } from "./labels";
import { addLine, addZone, autoFit, removeItem, updateBox } from "./model";
import { addMonitoringBlock, MONITORING_SERVICES } from "./monitoring";
import {
  Facts,
  FormFrame,
  LineFields,
  LineForm,
  PaneLayout,
  RemoveButton,
  Segmented,
  SelectButton,
  SizingSwitch,
  Suggested,
  ZoneFields,
  ZoneForm,
} from "./parts";
import { MONITORING_BLOCKS, type MonitoringBlock } from "./shapes";
import { TrmPicker } from "./solution";

const SERVICE_NAMES = MONITORING_SERVICES.map((service) => service.name);

function useBlockKinds() {
  const { t } = useTranslation();
  return MONITORING_BLOCKS.map((value) => ({
    value,
    label: t(`sad.diagram.monitoringBlocks.${value}`),
  }));
}

function BlockForm({
  diagram,
  versionId,
  onAdd,
  onCancel,
}: {
  diagram: Diagram;
  versionId: string;
  onAdd: (block: Parameters<typeof addMonitoringBlock>[1]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const kinds = useBlockKinds();
  const [type, setType] = useState<MonitoringBlock>("monitoring");
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<"trm" | "typed">("trm");
  const [picked, setPicked] = useState<BusinessApplication | null>(null);
  const [parent, setParent] = useState(TOP);
  const [tried, setTried] = useState(false);
  const fromTrm = type === "system" && source === "trm";
  const parentId = parent === TOP ? undefined : parent;
  const nameError =
    tried && !label.trim()
      ? t(
          type === "monitoring"
            ? "sad.diagram.monitoringServiceNeeded"
            : "sad.diagram.nameNeeded",
        )
      : undefined;
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
        label={t("sad.diagram.kind")}
        options={kinds}
        value={type}
        onValueChange={setType}
      />
      {type === "system" && (
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
          label={t("sad.diagram.systemInTrm")}
          value={picked}
          onPick={setPicked}
          error={tried && !picked ? t("sad.diagram.systemNeeded") : undefined}
        />
      ) : type === "monitoring" ? (
        <Suggested
          label={t("sad.diagram.service")}
          hint={t("sad.diagram.serviceHint")}
          value={label}
          suggestions={SERVICE_NAMES}
          onChange={setLabel}
          error={nameError}
        />
      ) : (
        <TextField
          label={t("sad.diagram.name")}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          error={nameError}
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

/** The selected grouping box, block or connection: its fields to edit, or its facts read-only. */
function MonitoringDetails({
  diagram,
  selected,
  versionId,
  change,
  onRemoved,
}: {
  diagram: Diagram;
  selected: string | null;
  versionId?: string;
  change?: Change;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const kinds = useBlockKinds();
  const kindOf = useKindOf();
  const name = namesOf(diagram);
  const zone = diagram.zones.find((item) => item.id === selected);
  const box = diagram.boxes.find((item) => item.id === selected);
  const line = diagram.lines.find((item) => item.id === selected);
  if (!zone && !box && !line)
    return (
      <p className="text-sm text-text-subdued">{t("sad.diagram.selectHint")}</p>
    );
  const notInside = t("sad.diagram.notInsideGroup");
  const heading = line
    ? `${name(line.from)} → ${name(line.to)}`
    : (zone ?? box)!.label;
  const inside = (item: Zone | Box) => name(item.parentId) || notInside;
  if (!change) {
    const facts: [string, string][] = line
      ? [
          [t("sad.diagram.label"), line.label ?? "—"],
          [t("sad.diagram.style"), lineStyle(t, line)],
        ]
      : zone
        ? [
            [t("sad.diagram.kind"), zone.kind ?? "—"],
            [t("sad.diagram.inside"), inside(zone)],
          ]
        : [
            [t("sad.diagram.kind"), kindOf(boxKind(box!))],
            [t("sad.diagram.inside"), inside(box!)],
          ];
    return <Facts heading={heading} facts={facts} />;
  }
  const pick = (item: Box) => (app: BusinessApplication | null) =>
    app &&
    change((d) =>
      updateBox(d, item.id, {
        label: app.name,
        application: { id: app.id, number: app.number },
      }),
    );
  const rename = (item: Box) => (label: string) =>
    change((d) => updateBox(d, item.id, { label }));
  const nameError = (item: Box) =>
    item.label.trim() ? undefined : t("sad.diagram.nameNeeded");
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-base font-semibold">{heading}</h4>
      {zone && (
        <ZoneFields
          diagram={diagram}
          zone={zone}
          notInside={notInside}
          change={change}
        />
      )}
      {box && (
        <>
          <Dropdown
            label={t("sad.diagram.kind")}
            options={kinds}
            value={box.type as MonitoringBlock}
            onValueChange={(type) =>
              change((d) => updateBox(d, box.id, { type }))
            }
          />
          {box.application ? (
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
                  change((d) =>
                    updateBox(d, box.id, { application: undefined }),
                  )
                }
              >
                {t("sad.diagram.unlink")}
              </Button>
            </>
          ) : box.type === "monitoring" ? (
            <Suggested
              label={t("sad.diagram.service")}
              hint={t("sad.diagram.serviceHint")}
              value={box.label}
              suggestions={SERVICE_NAMES}
              onChange={rename(box)}
              error={nameError(box)}
            />
          ) : (
            <TextField
              key={`${box.id}-label`}
              label={t("sad.diagram.name")}
              value={box.label}
              error={nameError(box)}
              onChange={(event) => rename(box)(event.target.value)}
            />
          )}
          {box.type === "system" && !box.application && (
            <TrmPicker
              key={`${box.id}-link`}
              versionId={versionId!}
              label={t("sad.diagram.linkToTrm")}
              onPick={pick(box)}
            />
          )}
          <IconField box={box} change={change} />
          <Dropdown
            label={t("sad.diagram.inside")}
            options={zoneOptions(diagram, notInside)}
            value={box.parentId ?? TOP}
            onValueChange={(value) =>
              change((d) =>
                updateBox(d, box.id, {
                  parentId: value === TOP ? undefined : value,
                }),
              )
            }
          />
        </>
      )}
      {line && <LineFields diagram={diagram} line={line} change={change} />}
      <RemoveButton
        onRemove={() => {
          change((d) => removeItem(d, selected!));
          onRemoved();
        }}
      />
    </div>
  );
}

function MonitoringTables({
  diagram,
  select,
}: {
  diagram: Diagram;
  select: (id: string) => void;
}) {
  const { t } = useTranslation();
  const kindOf = useKindOf();
  const name = namesOf(diagram);
  const inside = (item: Zone | Box) => name(item.parentId) || "—";
  return (
    <>
      <DataTable<Zone>
        caption={t("sad.diagram.groups")}
        getRowId={(zone) => zone.id}
        rows={diagram.zones}
        emptyState={
          <p className="p-4 text-sm text-text-subdued">
            {t("sad.diagram.noGroups")}
          </p>
        }
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
      <DataTable<Box>
        caption={t("sad.diagram.blocksTable")}
        getRowId={(box) => box.id}
        rows={diagram.boxes}
        emptyState={
          <p className="p-4 text-sm text-text-subdued">
            {t("sad.diagram.noBlocks")}
          </p>
        }
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
            id: "kind",
            header: t("sad.diagram.kind"),
            accessor: (box) => kindOf(boxKind(box)),
          },
          { id: "inside", header: t("sad.diagram.inside"), accessor: inside },
        ]}
      />
      <DataTable<Line>
        caption={t("sad.diagram.connections")}
        getRowId={(line) => line.id}
        rows={diagram.lines}
        emptyState={
          <p className="p-4 text-sm text-text-subdued">
            {t("sad.diagram.noLines")}
          </p>
        }
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
          {
            id: "label",
            header: t("sad.diagram.label"),
            accessor: (line) => line.label ?? "—",
          },
          {
            id: "style",
            header: t("sad.diagram.style"),
            accessor: (line) => lineStyle(t, line),
          },
        ]}
      />
    </>
  );
}

/** The monitoring diagram: section 12 draws its monitoring services, other systems, teams and grouping boxes; everyone else reads it. */
export function MonitoringPane({
  diagram,
  mode,
  versionId,
  onChange,
}: {
  diagram: Diagram;
  mode: PaneMode;
  versionId?: string;
  onChange?: (diagram: Diagram) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<"group" | "block" | "connection" | null>(
    null,
  );
  const drawing = mode === "draw";
  const change: Change | undefined =
    drawing && onChange
      ? (fn, options) =>
          onChange(autoFit(fn(diagram), { push: !options?.dragging }))
      : undefined;
  const added = (d: Diagram, kind: "zones" | "boxes" | "lines") => {
    change!(() => d);
    setSelected(d[kind][d[kind].length - 1].id);
    setForm(null);
  };
  const cancel = () => setForm(null);
  return (
    <PaneLayout
      toolbar={
        change && (
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
            <SizingSwitch diagram={diagram} change={change} />
          </>
        )
      }
      form={
        change &&
        {
          group: (
            <ZoneForm
              diagram={diagram}
              title={t("sad.diagram.addGroup")}
              kindHint={t("sad.diagram.monitoringGroupHint")}
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
              onAdd={(block) =>
                added(addMonitoringBlock(diagram, block), "boxes")
              }
            />
          ),
          connection: (
            <LineForm
              diagram={diagram}
              title={t("sad.diagram.addConnection")}
              onCancel={cancel}
              onAdd={(line) => added(addLine(diagram, line), "lines")}
            />
          ),
          none: null,
        }[form ?? "none"]
      }
      canvas={
        <DiagramCanvas
          diagram={diagram}
          editable={drawing}
          selected={selected}
          onSelect={setSelected}
          onEdits={canvasEdits(diagram, change, setSelected)}
        />
      }
      hint={t(
        drawing ? "sad.diagram.canvasHint" : "sad.diagram.canvasHintReadOnly",
      )}
      details={
        <MonitoringDetails
          diagram={diagram}
          selected={selected}
          versionId={versionId}
          change={change}
          onRemoved={() => setSelected(null)}
        />
      }
      tables={<MonitoringTables diagram={diagram} select={setSelected} />}
    />
  );
}
