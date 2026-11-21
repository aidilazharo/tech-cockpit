import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/page/ConfirmDialog";
import {
  Button,
  DataTable,
  Dropdown,
  TextField,
  type DataTableColumn,
} from "../../../components/qi";
import { useServers } from "../queries";
import {
  type Box,
  type BusinessApplication,
  type Diagram,
  type DiagramApi,
  type DiagramView,
  type Hosting,
  type InfraBoxType,
  type InfraZoneKind,
  type Line,
  type Zone,
} from "../schemas";
import { DiagramCanvas } from "./DiagramCanvas";
import {
  canvasEdits,
  lineStyle,
  namesOf,
  type Change,
  type PaneMode,
} from "./helpers";
import {
  backToSetting,
  boxPlaces,
  canAddZone,
  copyFromProduction,
  isService,
  keepOwnName,
  strandedIfRemoved,
  zonePlaces,
} from "./infrastructure";
import { IconField, IconPicker } from "./IconPicker";
import { useHiddenRemoval } from "./hidden-removal";
import {
  IntegrationFields,
  IntegrationForm,
  IntegrationNotes,
} from "./integration";
import {
  boxKind,
  integrationFacts,
  tlsText,
  useInfraKindOf,
  useLineLabel,
} from "./labels";
import {
  addBox,
  addConnection,
  addLine,
  addZone,
  autoFit,
  integrationLost,
  removeItem,
  updateBox,
  updateZone,
} from "./model";
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
  ZoneSize,
} from "./parts";
import { TrmPicker } from "./solution";

/** The zones an author adds; the subscription, regions, data centres and office network are always there. */
const ADDED_ZONES: InfraZoneKind[] = [
  "vnet",
  "subnet",
  "internet",
  "azure-global",
  "third-party",
];
/** What section 2 may place on the diagram. */
const SHARED_KINDS: readonly InfraBoxType[] = ["business", "external"];
/** What section 3 adds: an Azure service is picked from the icon set (the generic service shapes are no longer offered). */
const DRAWN_KINDS: readonly InfraBoxType[] = [
  "server",
  "person",
  "firewall",
  "wifi",
  "vpn",
  "azure",
  "external",
  "business",
];

/** Zones to put a new zone or box in: the allowed ones, by name; empty when it sits outside the zones. */
function placeOptions(diagram: Diagram, places: (string | null)[]) {
  const name = namesOf(diagram);
  return places
    .filter((place): place is string => place !== null)
    .map((id) => ({ value: id, label: name(id) }));
}

/** Where a new zone or box goes: the allowed zones, none (outside the zones), or nowhere yet. */
function PlaceField({
  diagram,
  places,
  value,
  onChange,
}: {
  diagram: Diagram;
  places: (string | null)[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (places.includes(null)) return null;
  if (places.length === 0)
    return (
      <p className="text-sm text-text-error">{t("sad.diagram.nowhere")}</p>
    );
  return (
    <Dropdown
      label={t("sad.diagram.inside")}
      options={placeOptions(diagram, places)}
      value={value}
      onValueChange={onChange}
    />
  );
}

function InfraZoneForm({
  diagram,
  onAdd,
  onCancel,
}: {
  diagram: Diagram;
  onAdd: (zone: Parameters<typeof addZone>[1]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const kinds = ADDED_ZONES.filter((kind) => canAddZone(diagram, kind));
  const [kind, setKind] = useState(kinds[0]);
  const [label, setLabel] = useState("");
  const places = zonePlaces(diagram, kind);
  const [parent, setParent] = useState<string | null>(places[0]);
  const [tried, setTried] = useState(false);
  const inside = places.includes(parent) ? parent : (places[0] ?? null);
  return (
    <FormFrame
      title={t("sad.diagram.addZone")}
      onAdd={() => {
        setTried(true);
        if (label.trim() && places.length > 0)
          onAdd({ label, kind, parentId: inside ?? undefined });
      }}
      onCancel={onCancel}
    >
      <Dropdown
        label={t("sad.diagram.kind")}
        options={kinds.map((value) => ({
          value,
          label: t(`sad.diagram.zoneKinds.${value}`),
        }))}
        value={kind}
        onValueChange={setKind}
      />
      <TextField
        label={t("sad.diagram.name")}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        error={tried && !label.trim() ? t("sad.diagram.nameNeeded") : undefined}
      />
      <PlaceField
        diagram={diagram}
        places={places}
        value={inside}
        onChange={setParent}
      />
    </FormFrame>
  );
}

/** A server picked from the application's TRM servers. */
function ServerPicker({
  versionId,
  label,
  value,
  onPick,
  error,
}: {
  versionId: string;
  label: string;
  value: string | null;
  onPick: (server: { id: string; name: string }) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const servers = useServers(versionId).data?.items ?? [];
  if (servers.length === 0)
    return (
      <p className="text-sm text-text-subdued">{t("sad.diagram.noServers")}</p>
    );
  return (
    <Dropdown
      label={label}
      placeholder={t("sad.diagram.choose")}
      options={servers.map((server) => ({
        value: server.id,
        label: server.name,
      }))}
      value={value}
      onValueChange={(id) =>
        onPick(servers.find((server) => server.id === id)!)
      }
      error={error}
    />
  );
}

type Source = "solution" | "trm" | "typed";

function InfraBoxForm({
  diagram,
  versionId,
  offered,
  kinds,
  onAdd,
  onCancel,
}: {
  diagram: Diagram;
  versionId: string;
  offered: Box[];
  /** The kinds the editor may add: all of them in section 3, other applications and external parties in section 2 */
  kinds: readonly InfraBoxType[];
  onAdd: (box: Parameters<typeof addBox>[1]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<InfraBoxType>(kinds[0]);
  const [label, setLabel] = useState("");
  // Business applications already on the solution diagram are offered first.
  const [source, setSource] = useState<Source>(
    kinds[0] === "business" && offered.length > 0 ? "solution" : "trm",
  );
  const [server, setServer] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [fromSolution, setFromSolution] = useState<string | null>(null);
  const [fromTrm, setFromTrm] = useState<BusinessApplication | null>(null);
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const places = boxPlaces(diagram, type);
  const [parent, setParent] = useState<string | null>(places[0]);
  const [tried, setTried] = useState(false);
  const inside = places.includes(parent) ? parent : (places[0] ?? null);
  const sources: Source[] =
    type === "server"
      ? ["trm", "typed"]
      : type === "business"
        ? [
            ...(offered.length > 0 ? (["solution"] as const) : []),
            "trm",
            "typed",
          ]
        : ["typed"];
  const from = sources.includes(source) ? source : sources[0];
  const picked = (): Parameters<typeof addBox>[1] | null => {
    const parentId = inside ?? undefined;
    if (type === "azure")
      return label.trim() && icon ? { label, type, parentId, icon } : null;
    if (from === "typed")
      return label.trim() ? { label, type, parentId } : null;
    if (type === "server")
      return (
        server && {
          label: server.name,
          type,
          parentId,
          server: { id: server.id },
        }
      );
    if (from === "solution") {
      const block = offered.find((item) => item.id === fromSolution);
      return block
        ? { label: block.label, type, application: block.application }
        : null;
    }
    return (
      fromTrm && {
        label: fromTrm.name,
        type,
        application: { id: fromTrm.id, number: fromTrm.number },
      }
    );
  };
  const missing = tried && !picked();
  return (
    <FormFrame
      title={t("sad.diagram.addBox")}
      onAdd={() => {
        setTried(true);
        const box = picked();
        if (box && places.length > 0) onAdd(box);
      }}
      onCancel={onCancel}
    >
      <Dropdown
        label={t("sad.diagram.kind")}
        options={kinds.map((value) => ({
          value,
          label: t(`sad.diagram.infraTypes.${value}`),
        }))}
        value={type}
        onValueChange={(next) => {
          setType(next);
          setSource(
            next === "business" && offered.length > 0 ? "solution" : "trm",
          );
        }}
      />
      {sources.length > 1 && (
        <Segmented
          label={t("sad.diagram.source")}
          options={sources.map((value) => ({
            value,
            label: t(`sad.diagram.sources.${value}`),
          }))}
          value={from}
          onChange={setSource}
        />
      )}
      {from === "typed" && (
        <TextField
          label={t("sad.diagram.name")}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          error={
            tried && !label.trim() ? t("sad.diagram.nameNeeded") : undefined
          }
        />
      )}
      {type === "azure" && (
        <IconPicker
          label={t("sad.diagram.azureService")}
          value={icon}
          onPick={setIcon}
          error={tried && !icon ? t("sad.diagram.serviceNeeded") : undefined}
        />
      )}
      {from === "trm" && type === "server" && (
        <ServerPicker
          versionId={versionId}
          label={t("sad.diagram.trmServer")}
          value={server?.id ?? null}
          onPick={setServer}
          error={missing ? t("sad.diagram.choose") : undefined}
        />
      )}
      {from === "trm" && type === "business" && (
        <TrmPicker
          versionId={versionId}
          label={t("sad.diagram.trmApplication")}
          value={fromTrm}
          onPick={setFromTrm}
          error={missing ? t("sad.diagram.trmNeeded") : undefined}
        />
      )}
      {from === "solution" && (
        <Dropdown
          label={t("sad.diagram.onSolution")}
          placeholder={t("sad.diagram.choose")}
          options={offered.map((block) => ({
            value: block.id,
            label: block.label,
          }))}
          value={fromSolution}
          onValueChange={setFromSolution}
          error={missing ? t("sad.diagram.choose") : undefined}
        />
      )}
      <PlaceField
        diagram={diagram}
        places={places}
        value={inside}
        onChange={setParent}
      />
    </FormFrame>
  );
}

/** The selected zone, box or line: fixed zones keep their place and take their name from the hosting settings (or their own, on this diagram). */
/** Other applications and external parties: section 2 or section 3 editors place them. */
const sharedBox = (box: Box | undefined) =>
  box?.type === "business" || box?.type === "external";

/**
 * The selected zone, box or line. Section 3 edits everything but integration connections (fixed zones keep their
 * place and take their name from the hosting settings, or their own on this diagram); section 2 edits integration
 * connections, other applications and external parties; everything else is shown read-only.
 */
function InfraDetails({
  diagram,
  shown,
  selected,
  mode,
  versionId,
  apis,
  change,
  onRemoved,
}: {
  diagram: Diagram;
  /** The diagram with only this view's lines */
  shown: Diagram;
  selected: string | null;
  mode: PaneMode;
  versionId?: string;
  apis: DiagramApi[];
  change?: Change;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const kindOf = useInfraKindOf();
  const hiddenRemoval = useHiddenRemoval(diagram, selected);
  const name = namesOf(diagram);
  const zone = diagram.zones.find((z) => z.id === selected);
  const box = diagram.boxes.find((b) => b.id === selected);
  const line = shown.lines.find((l) => l.id === selected);
  if (!zone && !box && !line)
    return (
      <p className="text-sm text-text-subdued">{t("sad.diagram.selectHint")}</p>
    );
  const heading = line
    ? `${name(line.from)} → ${name(line.to)}`
    : (zone ?? box)!.label;
  const inside = (item: Zone | Box) =>
    name(item.parentId) || t("sad.diagram.notInsideZone");
  const zoneKind = (item: Zone) => t(`sad.diagram.zoneKinds.${item.kind}`);
  if (!change || (mode === "facts" && !line && !sharedBox(box))) {
    const facts: [string, string][] = line
      ? line.layer === "integration"
        ? integrationFacts(t, line, apis)
        : [
            [t("sad.diagram.label"), line.label ?? "—"],
            [t("sad.diagram.style"), lineStyle(t, line)],
          ]
      : [
          [
            t("sad.diagram.kind"),
            zone ? zoneKind(zone) : kindOf(boxKind(box!)),
          ],
          [t("sad.diagram.inside"), inside((zone ?? box)!)],
        ];
    return <Facts heading={heading} facts={facts} />;
  }
  const stranded = zone && strandedIfRemoved(diagram, zone.id);
  const remove = stranded ? (
    <p className="text-sm">
      {t("sad.diagram.removeInsideFirst", {
        name: zone.label,
        parent: name(zone.parentId) || t("sad.diagram.notInsideZone"),
      })}
    </p>
  ) : hiddenRemoval.blocked ? (
    <p className="text-sm">{hiddenRemoval.blocked}</p>
  ) : (
    <RemoveButton
      // Removing a box or zone takes its integration connections with it: section 3 is told they are section 2's.
      confirm={
        hiddenRemoval.confirm ??
        (integrationLost(diagram, selected!)
          ? {
              title: t("sad.diagram.removeConnectionsTitle"),
              description: t(
                mode === "draw"
                  ? "sad.diagram.removeConnections"
                  : "sad.diagram.removeOwnConnections",
                { name: heading },
              ),
            }
          : undefined)
      }
      onRemove={() => {
        change((d) => removeItem(d, selected!));
        onRemoved();
      }}
    />
  );
  const place = (
    item: Zone | Box,
    places: (string | null)[],
    update: (parentId: string) => void,
  ) =>
    places.includes(null) ? null : (
      <Dropdown
        label={t("sad.diagram.inside")}
        options={placeOptions(diagram, places)}
        value={item.parentId ?? null}
        onValueChange={update}
      />
    );
  const nameField = (item: Box) => (
    <TextField
      key={`${item.id}-label`}
      label={t("sad.diagram.name")}
      value={item.label}
      error={item.label.trim() ? undefined : t("sad.diagram.nameNeeded")}
      onChange={(event) =>
        change((d) => updateBox(d, item.id, { label: event.target.value }))
      }
    />
  );
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-base font-semibold">{heading}</h4>
      {zone?.hosting && (
        <>
          <TextField
            key={`${zone.id}-label`}
            label={t("sad.diagram.name")}
            value={zone.label}
            error={zone.label.trim() ? undefined : t("sad.diagram.nameNeeded")}
            onChange={(event) =>
              change((d) => keepOwnName(d, zone.id, event.target.value))
            }
          />
          <p className="text-sm text-text-subdued">
            {zone.ownName
              ? t("sad.diagram.ownName")
              : t("sad.diagram.fromHosting")}
          </p>
          {zone.ownName && (
            <div>
              <Button
                variant="tertiary"
                onClick={() => change((d) => backToSetting(d, zone.id))}
              >
                {t("sad.diagram.backToSetting")}
              </Button>
            </div>
          )}
          <ZoneSize diagram={diagram} zone={zone} change={change} />
        </>
      )}
      {zone && !zone.hosting && (
        <>
          <TextField
            key={`${zone.id}-label`}
            label={t("sad.diagram.name")}
            value={zone.label}
            error={zone.label.trim() ? undefined : t("sad.diagram.nameNeeded")}
            onChange={(event) =>
              change((d) =>
                updateZone(d, zone.id, { label: event.target.value }),
              )
            }
          />
          <Facts heading="" facts={[[t("sad.diagram.kind"), zoneKind(zone)]]} />
          {place(
            zone,
            zonePlaces(diagram, zone.kind as InfraZoneKind),
            (parentId) => change((d) => updateZone(d, zone.id, { parentId })),
          )}
          <ZoneSize diagram={diagram} zone={zone} change={change} />
          {remove}
        </>
      )}
      {box && (
        <>
          <Facts
            heading=""
            facts={[[t("sad.diagram.kind"), kindOf(boxKind(box))]]}
          />
          {box.server && (
            <>
              <p className="text-sm">
                {t("sad.diagram.serverFrom", { name: box.label })}
              </p>
              <ServerPicker
                key={`${box.id}-repick`}
                versionId={versionId!}
                label={t("sad.diagram.pickAnotherServer")}
                value={box.server.id}
                onPick={(server) =>
                  change((d) =>
                    updateBox(d, box.id, {
                      label: server.name,
                      server: { id: server.id },
                    }),
                  )
                }
              />
              <div>
                <Button
                  variant="tertiary"
                  onClick={() =>
                    change((d) => updateBox(d, box.id, { server: undefined }))
                  }
                >
                  {t("sad.diagram.unlink")}
                </Button>
              </div>
            </>
          )}
          {box.application && (
            <>
              <p className="text-sm">
                {t("sad.diagram.fromTrm", {
                  name: box.label,
                  number: box.application.number,
                })}
              </p>
              <div>
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
              </div>
            </>
          )}
          {!box.server && !box.application && nameField(box)}
          {box.type === "server" && !box.server && (
            <ServerPicker
              key={`${box.id}-link`}
              versionId={versionId!}
              label={t("sad.diagram.linkToServer")}
              value={null}
              onPick={(server) =>
                change((d) =>
                  updateBox(d, box.id, {
                    label: server.name,
                    server: { id: server.id },
                  }),
                )
              }
            />
          )}
          {box.type === "business" && !box.application && (
            <TrmPicker
              key={`${box.id}-link`}
              versionId={versionId!}
              label={t("sad.diagram.linkToTrm")}
              onPick={(app) =>
                app &&
                change((d) =>
                  updateBox(d, box.id, {
                    label: app.name,
                    application: { id: app.id, number: app.number },
                  }),
                )
              }
            />
          )}
          <IconField box={box} change={change} service={isService(box.type)} />
          {place(box, boxPlaces(diagram, box.type), (parentId) =>
            change((d) => updateBox(d, box.id, { parentId })),
          )}
          {remove}
        </>
      )}
      {line && (
        <>
          {line.layer === "integration" ? (
            <IntegrationFields
              diagram={diagram}
              line={line}
              apis={apis}
              change={change}
            />
          ) : (
            <LineFields diagram={diagram} line={line} change={change} />
          )}
          {remove}
        </>
      )}
    </div>
  );
}

/**
 * The infrastructure diagram (one tab) in one view. Section 3 draws it (Infrastructure view: zones and boxes only
 * where they may sit, infrastructure lines); section 2 adds the integration connections and their facts
 * (Integration view); everyone else reads it. Each view shows only its own lines.
 */
export function InfrastructurePane({
  diagram,
  view,
  mode,
  versionId,
  offered,
  apis,
  onChange,
}: {
  diagram: Diagram;
  view: DiagramView;
  mode: PaneMode;
  versionId?: string;
  offered: Box[];
  apis: DiagramApi[];
  onChange?: (diagram: Diagram) => void;
}) {
  const { t } = useTranslation();
  const kindOf = useInfraKindOf();
  const integrationLabel = useLineLabel("integration");
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<
    "zone" | "box" | "line" | "connection" | null
  >(null);
  const drawing = mode === "draw";
  const integration = view === "integration";
  const change: Change | undefined =
    onChange && mode !== "read"
      ? (fn, options) =>
          onChange(autoFit(fn(diagram), { push: !options?.dragging }))
      : undefined;
  const shown: Diagram = {
    ...diagram,
    lines: diagram.lines.filter(
      (line) => (line.layer === "integration") === integration,
    ),
  };
  const name = namesOf(diagram);
  const added = (d: Diagram, kind: "zones" | "boxes" | "lines") => {
    change!(() => d);
    setSelected(d[kind][d[kind].length - 1].id);
    setForm(null);
  };
  const cancel = () => setForm(null);
  const inside = (item: Zone | Box) => name(item.parentId) || "—";
  const lineColumns: DataTableColumn<Line>[] = integration
    ? [
        {
          id: "transport",
          header: t("sad.diagram.protocolAndPort"),
          accessor: (line) =>
            [line.protocol, line.port]
              .filter((part) => part !== undefined)
              .join(" ") || "—",
        },
        {
          id: "tls",
          header: t("sad.diagram.tls"),
          accessor: (line) => tlsText(t, line),
        },
        {
          id: "pattern",
          header: t("sad.diagram.pattern"),
          accessor: (line) =>
            line.pattern ? t(`sad.diagram.patterns.${line.pattern}`) : "—",
        },
      ]
    : [
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
      ];
  return (
    <PaneLayout
      toolbar={
        change &&
        (drawing ? (
          <>
            <Button variant="secondary" onClick={() => setForm("zone")}>
              {t("sad.diagram.addZone")}
            </Button>
            <Button variant="secondary" onClick={() => setForm("box")}>
              {t("sad.diagram.addBox")}
            </Button>
            <Button variant="secondary" onClick={() => setForm("line")}>
              {t("sad.diagram.addLine")}
            </Button>
            <SizingSwitch diagram={diagram} change={change} />
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => setForm("connection")}
              disabled={diagram.boxes.length < 2}
            >
              {t("sad.diagram.addConnection")}
            </Button>
            <Button variant="secondary" onClick={() => setForm("box")}>
              {t("sad.diagram.addBox")}
            </Button>
          </>
        ))
      }
      form={
        change &&
        {
          zone: (
            <InfraZoneForm
              diagram={diagram}
              onCancel={cancel}
              onAdd={(zone) => added(addZone(diagram, zone), "zones")}
            />
          ),
          box: (
            <InfraBoxForm
              diagram={diagram}
              versionId={versionId!}
              offered={offered}
              kinds={drawing ? DRAWN_KINDS : SHARED_KINDS}
              onCancel={cancel}
              onAdd={(box) => added(addBox(diagram, box), "boxes")}
            />
          ),
          line: (
            <LineForm
              diagram={diagram}
              onCancel={cancel}
              onAdd={(line) => added(addLine(diagram, line), "lines")}
            />
          ),
          connection: (
            <IntegrationForm
              diagram={diagram}
              onCancel={cancel}
              onAdd={(line) => added(addConnection(diagram, line), "lines")}
            />
          ),
          none: null,
        }[form ?? "none"]
      }
      notes={mode === "facts" && <IntegrationNotes diagram={shown} />}
      canvas={
        <DiagramCanvas
          diagram={shown}
          editable={drawing}
          selected={selected}
          onSelect={setSelected}
          onEdits={canvasEdits(diagram, change, setSelected)}
          lineLabel={integration ? integrationLabel : undefined}
          boxKind={kindOf}
        />
      }
      hint={t(
        `sad.diagram.${{ draw: "canvasHint", facts: "canvasHintFacts", read: "canvasHintReadOnly" }[mode]}`,
      )}
      details={
        <InfraDetails
          diagram={diagram}
          shown={shown}
          selected={selected}
          mode={mode}
          versionId={versionId}
          apis={apis}
          change={change}
          onRemoved={() => setSelected(null)}
        />
      }
      tables={
        <>
          <DataTable<Zone>
            caption={t("sad.diagram.zones")}
            getRowId={(zone) => zone.id}
            rows={diagram.zones}
            emptyState={
              <p className="p-4 text-sm text-text-subdued">
                {t("sad.diagram.noZones")}
              </p>
            }
            columns={[
              {
                id: "name",
                header: t("sad.diagram.name"),
                cell: (zone) => (
                  <SelectButton onClick={() => setSelected(zone.id)}>
                    {zone.label}
                  </SelectButton>
                ),
              },
              // Every infrastructure zone has a kind (the API refuses one without).
              {
                id: "kind",
                header: t("sad.diagram.kind"),
                accessor: (zone) => t(`sad.diagram.zoneKinds.${zone.kind}`),
              },
              {
                id: "inside",
                header: t("sad.diagram.inside"),
                accessor: inside,
              },
            ]}
          />
          <DataTable<Box>
            caption={t("sad.diagram.boxes")}
            getRowId={(box) => box.id}
            rows={diagram.boxes}
            emptyState={
              <p className="p-4 text-sm text-text-subdued">
                {t("sad.diagram.noBoxes")}
              </p>
            }
            columns={[
              {
                id: "name",
                header: t("sad.diagram.name"),
                cell: (box) => (
                  <SelectButton onClick={() => setSelected(box.id)}>
                    {box.label}
                  </SelectButton>
                ),
              },
              {
                id: "kind",
                header: t("sad.diagram.kind"),
                accessor: (box) => kindOf(boxKind(box)),
              },
              {
                id: "inside",
                header: t("sad.diagram.inside"),
                accessor: inside,
              },
            ]}
          />
          <DataTable<Line>
            caption={
              integration
                ? t("sad.diagram.connections")
                : t("sad.diagram.lines")
            }
            getRowId={(line) => line.id}
            rows={shown.lines}
            emptyState={
              <p className="p-4 text-sm text-text-subdued">
                {integration
                  ? t("sad.diagram.noConnections")
                  : t("sad.diagram.noLines")}
              </p>
            }
            columns={[
              {
                id: "ends",
                header: `${t("sad.diagram.from")} → ${t("sad.diagram.to")}`,
                cell: (line) => (
                  <SelectButton onClick={() => setSelected(line.id)}>
                    {name(line.from)} → {name(line.to)}
                  </SelectButton>
                ),
              },
              ...lineColumns,
            ]}
          />
        </>
      }
    />
  );
}

/** Non-production becomes a copy of production, after asking when it already has boxes or lines. */
export function CopyFromProduction({
  content,
  onChange,
}: {
  content: { diagrams: Diagram[]; hosting?: Hosting };
  onChange: (content: { diagrams: Diagram[]; hosting?: Hosting }) => void;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [, nonProduction] = content.diagrams;
  const copy = () =>
    onChange(
      copyFromProduction(content) as { diagrams: Diagram[]; hosting?: Hosting },
    );
  return (
    <div>
      <Button
        variant="secondary"
        onClick={() =>
          nonProduction.boxes.length + nonProduction.lines.length > 0
            ? setAsking(true)
            : copy()
        }
      >
        {t("sad.diagram.copyFromProduction")}
      </Button>
      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={t("sad.diagram.copyTitle")}
        description={t("sad.diagram.copyQuestion")}
        confirmLabel={t("sad.diagram.copy")}
        onConfirm={() => {
          setAsking(false);
          copy();
        }}
      />
    </div>
  );
}
