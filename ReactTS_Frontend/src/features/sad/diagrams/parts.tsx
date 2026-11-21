import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/page/ConfirmDialog";
import { Button, Checkbox, Dropdown, TextField } from "../../../components/qi";
import { cn } from "../../../lib/cn";
import type { Diagram, Line, Zone } from "../schemas";
import { TOP, zoneOptions, type Change } from "./helpers";
import { updateLine, updateZone, resizeZone } from "./model";

// Pieces every diagram pane shares: the generic one and the solution diagram's.

export function SelectButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left font-semibold text-text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-border-focus"
    >
      {children}
    </button>
  );
}

/** Chooses one file from the computer (cleared after each choice, so the same file can be chosen again). */
export function FileChooser({
  label,
  hint,
  accept,
  onFile,
  disabled,
}: {
  label: string;
  hint: string;
  accept: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
        className="text-sm file:mr-3 file:min-h-10 file:rounded-button file:border file:border-border-default file:bg-surface-enabled-1 file:px-3 file:font-semibold"
      />
      <p id={`${id}-hint`} className="text-xs text-text-subdued">
        {hint}
      </p>
    </div>
  );
}

/** Typed text with suggestions (protocols, authentication methods, monitoring services). */
export function Suggested({
  label,
  hint,
  value,
  suggestions,
  onChange,
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
  error?: string;
}) {
  const list = useId();
  return (
    <>
      <TextField
        label={label}
        hint={hint}
        value={value}
        list={list}
        onChange={(event) => onChange(event.target.value)}
        error={error}
      />
      <datalist id={list}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </>
  );
}

/** Mutually exclusive options as a row of buttons (zone sizes, direction). */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}) {
  // Native radios: the browser moves between them with the arrow keys.
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 self-start rounded-button border border-divider-default p-1"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "inline-flex min-h-8 cursor-pointer items-center rounded-button px-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-border-focus",
            value === option.value
              ? "bg-surface-selected-1 font-semibold text-text-selected"
              : "text-text-subdued hover:bg-surface-hover-1",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function FormFrame({
  title,
  onAdd,
  onCancel,
  children,
}: {
  title: string;
  onAdd: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex max-w-3xl flex-col gap-3 rounded-card border border-border-selected p-4">
      <legend className="px-1 text-base font-semibold">{title}</legend>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAdd}>{t("sad.diagram.add")}</Button>
        <Button variant="tertiary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </fieldset>
  );
}

/** A zone (a grouping box on the solution diagram): name, optional kind, and the zone it sits in. */
export function ZoneForm({
  diagram,
  title,
  kindHint,
  notInside,
  onAdd,
  onCancel,
}: {
  diagram: Diagram;
  title: string;
  kindHint: string;
  notInside: string;
  onAdd: (zone: { label: string; kind?: string; parentId?: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("");
  const [parent, setParent] = useState(TOP);
  const [tried, setTried] = useState(false);
  return (
    <FormFrame
      title={title}
      onAdd={() => {
        setTried(true);
        if (label.trim())
          onAdd({ label, kind, parentId: parent === TOP ? undefined : parent });
      }}
      onCancel={onCancel}
    >
      <TextField
        label={t("sad.diagram.name")}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        error={tried && !label.trim() ? t("sad.diagram.nameNeeded") : undefined}
      />
      <TextField
        label={t("sad.diagram.kind")}
        hint={kindHint}
        value={kind}
        onChange={(event) => setKind(event.target.value)}
      />
      <Dropdown
        label={t("sad.diagram.inside")}
        options={zoneOptions(diagram, notInside)}
        value={parent}
        onValueChange={setParent}
      />
    </FormFrame>
  );
}

type End = { value: string; label: string };
/** What a line may join: every box and zone, unless the diagram says otherwise (CI and CD flows: steps only). */
const allEnds = (diagram: Diagram): End[] =>
  [...diagram.boxes, ...diagram.zones].map((item) => ({
    value: item.id,
    label: item.label,
  }));

/** A line: its two ends, label and style. */
export function LineForm({
  diagram,
  title,
  ends = allEnds(diagram),
  onAdd,
  onCancel,
}: {
  diagram: Diagram;
  title?: string;
  ends?: End[];
  onAdd: (line: {
    from: string;
    to: string;
    label?: string;
    dashed?: boolean;
    twoWay?: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [dashed, setDashed] = useState(false);
  const [twoWay, setTwoWay] = useState(false);
  const [tried, setTried] = useState(false);
  const same = from !== null && from === to;
  return (
    <FormFrame
      title={title ?? t("sad.diagram.addLine")}
      onAdd={() => {
        setTried(true);
        if (from && to && !same) onAdd({ from, to, label, dashed, twoWay });
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
        label={t("sad.diagram.label")}
        hint={t("sad.diagram.labelHint")}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <div className="flex flex-col">
        <Checkbox
          label={t("sad.diagram.dashed")}
          checked={dashed}
          onCheckedChange={setDashed}
        />
        <Checkbox
          label={t("sad.diagram.twoWay")}
          checked={twoWay}
          onCheckedChange={setTwoWay}
        />
      </div>
    </FormFrame>
  );
}

/** A selected line's editable fields. */
export function LineFields({
  diagram,
  line,
  change,
  ends = allEnds(diagram),
}: {
  diagram: Diagram;
  line: Line;
  change: Change;
  ends?: End[];
}) {
  const { t } = useTranslation();
  return (
    <>
      <Dropdown
        label={t("sad.diagram.from")}
        options={ends.filter((end) => end.value !== line.to)}
        value={line.from}
        onValueChange={(from) =>
          change((d) => updateLine(d, line.id, { from }))
        }
      />
      <Dropdown
        label={t("sad.diagram.to")}
        options={ends.filter((end) => end.value !== line.from)}
        value={line.to}
        onValueChange={(to) => change((d) => updateLine(d, line.id, { to }))}
      />
      <TextField
        key={`${line.id}-label`}
        label={t("sad.diagram.label")}
        value={line.label ?? ""}
        onChange={(event) =>
          change((d) => updateLine(d, line.id, { label: event.target.value }))
        }
      />
      <Checkbox
        label={t("sad.diagram.dashed")}
        checked={line.dashed === true}
        onCheckedChange={(dashed) =>
          change((d) => updateLine(d, line.id, { dashed: dashed || undefined }))
        }
      />
      <Checkbox
        label={t("sad.diagram.twoWay")}
        checked={line.twoWay === true}
        onCheckedChange={(twoWay) =>
          change((d) => updateLine(d, line.id, { twoWay: twoWay || undefined }))
        }
      />
    </>
  );
}

/** A selected zone's editable fields. */
export function ZoneFields({
  diagram,
  zone,
  notInside,
  change,
}: {
  diagram: Diagram;
  zone: Zone;
  notInside: string;
  change: Change;
}) {
  const { t } = useTranslation();
  return (
    <>
      <TextField
        key={`${zone.id}-label`}
        label={t("sad.diagram.name")}
        value={zone.label}
        error={zone.label.trim() ? undefined : t("sad.diagram.nameNeeded")}
        onChange={(event) =>
          change((d) => updateZone(d, zone.id, { label: event.target.value }))
        }
      />
      <TextField
        key={`${zone.id}-kind`}
        label={t("sad.diagram.kind")}
        value={zone.kind ?? ""}
        onChange={(event) =>
          change((d) => updateZone(d, zone.id, { kind: event.target.value }))
        }
      />
      <Dropdown
        label={t("sad.diagram.inside")}
        options={zoneOptions(diagram, notInside, zone.id)}
        value={zone.parentId ?? TOP}
        onValueChange={(value) =>
          change((d) =>
            updateZone(d, zone.id, {
              parentId: value === TOP ? undefined : value,
            }),
          )
        }
      />
      <ZoneSize diagram={diagram} zone={zone} change={change} />
    </>
  );
}

const SIZE = { min: 20, max: 50_000 };

/** One size in pixels: the typed text is kept while editing, and only a whole number in range is applied. */
function SizeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (size: number) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const fits = (typed: string) =>
    /^\d+$/.test(typed.trim()) &&
    Number(typed) >= SIZE.min &&
    Number(typed) <= SIZE.max;
  return (
    <TextField
      type="number"
      inputMode="numeric"
      label={label}
      value={editing ? text : String(value)}
      onFocus={() => {
        setText(String(value));
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={(event) => {
        setText(event.target.value);
        if (fits(event.target.value)) onCommit(Number(event.target.value));
      }}
      error={
        editing && !fits(text)
          ? t("sad.diagram.sizeRange", {
              min: SIZE.min,
              max: SIZE.max.toLocaleString("en-MY"),
            })
          : undefined
      }
    />
  );
}

/** A zone sized by hand: its width and height, the keyboard way to resize it (the canvas drags its corners). */
export function ZoneSize({
  diagram,
  zone,
  change,
}: {
  diagram: Diagram;
  zone: Zone;
  change: Change;
}) {
  const { t } = useTranslation();
  if (diagram.sizing !== "manual") return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <SizeField
        label={t("sad.diagram.width")}
        value={zone.width}
        onCommit={(width) =>
          change((d) => resizeZone(d, zone.id, width, zone.height))
        }
      />
      <SizeField
        label={t("sad.diagram.height")}
        value={zone.height}
        onCommit={(height) =>
          change((d) => resizeZone(d, zone.id, zone.width, height))
        }
      />
    </div>
  );
}

/** Read-only facts of what is selected. */
export function Facts({
  heading,
  facts,
}: {
  heading: string;
  facts: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-base font-semibold">{heading}</h4>
      <dl className="flex flex-col gap-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold text-text-subdued">{label}</dt>
            <dd className="text-sm whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Removes what is selected; asks first when that would also remove what another section wrote (`confirm` says so). */
export function RemoveButton({
  confirm,
  onRemove,
}: {
  confirm?: { title: string; description: string };
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  return (
    <div>
      <Button
        variant="secondary"
        onClick={() => (confirm ? setAsking(true) : onRemove())}
      >
        {t("sad.diagram.remove")}
      </Button>
      {confirm && (
        <ConfirmDialog
          open={asking}
          onClose={() => setAsking(false)}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={t("sad.diagram.remove")}
          onConfirm={() => {
            setAsking(false);
            onRemove();
          }}
        />
      )}
    </div>
  );
}

/** Automatic or by-hand zone sizes, with what each means. */
export function SizingSwitch({
  diagram,
  change,
}: {
  diagram: Diagram;
  change: Change;
}) {
  const { t } = useTranslation();
  return (
    <>
      <span className="text-sm font-semibold">
        {t("sad.diagram.zoneSizes")}
      </span>
      <Segmented
        label={t("sad.diagram.zoneSizes")}
        options={[
          { value: "auto", label: t("sad.diagram.auto") },
          { value: "manual", label: t("sad.diagram.manual") },
        ]}
        value={diagram.sizing}
        onChange={(sizing) => change((d) => ({ ...d, sizing }))}
      />
      <span className="text-xs text-text-subdued">
        {diagram.sizing === "auto"
          ? t("sad.diagram.autoHint")
          : t("sad.diagram.manualHint")}
      </span>
    </>
  );
}

/** One diagram's layout: toolbar and form, notes, the canvas beside the details, then the tables. */
export function PaneLayout({
  toolbar,
  form,
  notes,
  canvas,
  hint,
  details,
  tables,
}: {
  toolbar?: ReactNode;
  form?: ReactNode;
  notes?: ReactNode;
  canvas: ReactNode;
  hint: string;
  details: ReactNode;
  tables: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      {toolbar && (
        <div className="flex flex-wrap items-center gap-3">{toolbar}</div>
      )}
      {form}
      {notes}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-1">
          {canvas}
          <p className="text-xs text-text-subdued">{hint}</p>
        </div>
        <aside
          aria-label={t("sad.diagram.details")}
          className="rounded-card border border-divider-default p-4"
        >
          {details}
        </aside>
      </div>
      {tables}
    </div>
  );
}
