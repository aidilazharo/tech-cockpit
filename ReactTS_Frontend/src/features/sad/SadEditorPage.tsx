import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { appName, questionsLeft, sectionAnswers } from "./format";
import {
  useBlocker,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router";
import { ConfirmDialog } from "../../components/page/ConfirmDialog";
import { PageHeader } from "../../components/page/PageHeader";
import {
  ActionFailed,
  LoadFailed,
  Loading,
} from "../../components/page/QueryStates";
import { Button, ButtonLink, PageMessage } from "../../components/qi";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/cn";
import { BackLink, DetailStates } from "../trm/parts";
import { hiddenQuestions, warningOf, type KnownAnswers } from "./logic";
import { QuestionWarning } from "./QuestionWarning";
import { LocalAuthFlag } from "./LocalAuthFlag";
import { type FieldContext, QuestionField } from "./QuestionField";
import { forSaving } from "./diagrams/editing";
import { GroupDiagrams } from "./diagrams/GroupDiagrams";
import {
  sadKeys,
  useAddUpload,
  useRetention,
  useSadDiagrams,
  useSadTemplate,
  useSadVersion,
  useSaveDiagram,
  useSaveSection,
} from "./queries";
import { refusal } from "./diagrams/files";
import type {
  Answer,
  DiagramApi,
  DiagramContent,
  DiagramSlot,
  DiagramSlotData,
  SadSectionKey,
  SectionAnswers,
  Template,
  Version,
} from "./schemas";
import { SectionNav } from "./SectionNav";
import { SectionView } from "./SectionView";
import { useSadAbilities } from "./status";
import { useVersionLabel } from "./version-label";

/** The ids of a slot's diagrams (none when it does not apply). */
const diagramIds = (content: DiagramContent) =>
  "notApplicable" in content
    ? []
    : content.diagrams.map((diagram) => diagram.id);

/** The API names invalid answers "answers.<question>.…": one message per question. */
function errorsByQuestion(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.status !== 400) return {};
  return Object.fromEntries(
    error.errors
      .filter((e) => e.path.startsWith("answers."))
      .map((e) => [e.path.split(".")[1], e.message]),
  );
}

function SectionEditor({
  version,
  template,
  sectionKey,
  context,
  slots,
  slotsLoad,
  apis,
  onDirtyChange,
  onSaved,
}: {
  version: Version;
  template: Template;
  sectionKey: SadSectionKey;
  context: FieldContext;
  /** The diagram slots the caller may see, and how loading them went */
  slots: DiagramSlotData[] | undefined;
  slotsLoad: { failed: boolean; retry: () => void };
  /** The API inventory's APIs by name, which integration connections link to */
  apis: DiagramApi[] | undefined;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const data = version.sections.find((section) => section.key === sectionKey)!;
  const section = template.sections.find((s) => s.key === sectionKey)!;
  const [answers, setAnswers] = useState<SectionAnswers>(
    sectionAnswers(version, sectionKey),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<
    Partial<Record<DiagramSlot, DiagramContent>>
  >({});
  const [diagramErrors, setDiagramErrors] = useState<
    Partial<Record<DiagramSlot, string>>
  >({});
  const [diagramConflict, setDiagramConflict] = useState<DiagramSlot | null>(
    null,
  );
  const save = useSaveSection(version.id);
  const saveDiagram = useSaveDiagram(version.id);
  const addUpload = useAddUpload(version.id);
  // Imported draw.io files wait with their diagrams: each is kept under the diagrams it made once its slot is saved.
  const [imports, setImports] = useState<
    { slot: DiagramSlot; file: File; diagramIds: string[] }[]
  >([]);
  const known: KnownAnswers = Object.fromEntries(
    version.sections
      .filter((s) => s.readable)
      .map((s) => [
        s.key,
        s.key === sectionKey ? answers : sectionAnswers(version, s.key),
      ]),
  );
  const hidden = hiddenQuestions(template, known, version.hidden);
  const left = questionsLeft(version, sectionKey);
  const conflict = save.error instanceof ApiError && save.error.status === 409;

  if (!data.editable) {
    return (
      <div className="flex flex-col gap-4">
        <PageMessage variant="informative">
          {t("sad.editor.readOnly")}
        </PageMessage>
        <SectionView
          section={section}
          answers={answers}
          hidden={hidden}
          context={context}
          diagrams={{
            template,
            slots,
            apis,
            applicationId: version.application.id,
            versionId: version.id,
            load: slotsLoad,
          }}
        />
      </div>
    );
  }

  const change = (key: string, answer: Answer | undefined) => {
    setAnswers((previous) => {
      const next = { ...previous };
      if (answer === undefined) delete next[key];
      else next[key] = answer;
      return next;
    });
    setErrors((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([question]) => question !== key),
      ),
    );
    onDirtyChange(true);
  };
  const changeDiagram = (slot: DiagramSlot, content: DiagramContent) => {
    setDrafts((previous) => ({ ...previous, [slot]: content }));
    setDiagramErrors((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => key !== slot),
      ),
    );
    onDirtyChange(true);
  };
  /** Changed diagrams first, then the answers: a failed diagram never costs the section's answers. */
  const submit = async () => {
    // A question no longer shown is not asked: a Does not apply left blank on it is dropped, not refused.
    const blankHidden = (key: string, answer: Answer) =>
      hidden.has(key) &&
      "notApplicable" in answer &&
      answer.reason.trim() === "";
    const sent = Object.fromEntries(
      Object.entries(answers).filter(
        ([key, answer]) => !blankHidden(key, answer),
      ),
    );
    const blank = Object.entries(sent).filter(
      ([, answer]) => "notApplicable" in answer && answer.reason.trim() === "",
    );
    const blankDiagrams = Object.entries(drafts).filter(
      ([, content]) =>
        "notApplicable" in content && content.reason.trim() === "",
    );
    if (blank.length > 0 || blankDiagrams.length > 0) {
      setErrors(
        Object.fromEntries(
          blank.map(([key]) => [key, t("sad.editor.reasonNeeded")]),
        ),
      );
      setDiagramErrors(
        Object.fromEntries(
          blankDiagrams.map(([slot]) => [slot, t("sad.diagram.reasonNeeded")]),
        ),
      );
      return;
    }
    setDiagramConflict(null);
    // The diagrams each slot now holds, as saved: an imported diagram removed (or answered Does not apply) keeps nothing.
    const savedIds = new Map(
      (slots ?? []).map((slot) => [slot.slot, diagramIds(slot.content)]),
    );
    for (const [slot, content] of Object.entries(drafts) as [
      DiagramSlot,
      DiagramContent,
    ][]) {
      savedIds.set(slot, diagramIds(content));
      try {
        // A draft exists only for a slot the caller could see.
        await saveDiagram.mutateAsync({
          slot,
          ...forSaving(content),
          version: slots!.find((s) => s.slot === slot)!.rowVersion,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409)
          setDiagramConflict(slot);
        else {
          const message =
            error instanceof ApiError && error.errors.length > 0
              ? error.errors[0].message
              : (error as Error).message;
          setDiagramErrors((previous) => ({
            ...previous,
            [slot]: t("sad.diagram.saveFailed", {
              slot: t(`sad.diagram.slots.${slot}`),
              message,
            }),
          }));
        }
        return;
      }
      setDrafts((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([key]) => key !== slot),
        ),
      );
    }
    // Then the draw.io files imported into the slots just saved; one not kept stops here, and Save tries it again.
    for (const imported of imports) {
      const item = {
        ...imported,
        diagramIds: imported.diagramIds.filter((id) =>
          savedIds.get(imported.slot)?.includes(id),
        ),
      };
      // draw.io's .xml files are kept as .drawio, the format uploads take.
      const name = item.file.name.replace(/\.xml$/i, ".drawio");
      for (const [index, diagramId] of item.diagramIds.entries()) {
        try {
          await addUpload.mutateAsync({
            slot: item.slot,
            diagramId,
            file: item.file,
            name,
          });
        } catch (error) {
          // The diagrams already done keep it; the rest wait for the next save.
          const left = item.diagramIds.slice(index);
          setImports((previous) =>
            previous.map((pending) =>
              pending === imported ? { ...pending, diagramIds: left } : pending,
            ),
          );
          setDiagramErrors((previous) => ({
            ...previous,
            [item.slot]: t("sad.diagram.files.keptFailed", {
              message: refusal(t, error),
            }),
          }));
          return;
        }
      }
      setImports((previous) =>
        previous.filter((pending) => pending !== imported),
      );
    }
    try {
      await save.mutateAsync({
        section: sectionKey,
        answers: sent,
        version: data.rowVersion,
      });
      onDirtyChange(false);
      onSaved();
    } catch (error) {
      setErrors(errorsByQuestion(error));
    }
  };
  const reload = () => {
    setDrafts({});
    setImports([]);
    setDiagramConflict(null);
    void client.invalidateQueries({ queryKey: sadKeys.version(version.id) });
    void client.invalidateQueries({ queryKey: sadKeys.diagrams(version.id) });
  };

  return (
    <form
      aria-labelledby={`editing-${sectionKey}`}
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 id={`editing-${sectionKey}`} className="heading-2">
          {section.title}
        </h2>
        <p className="text-text-subdued">
          {left === 0
            ? t("sad.editor.sectionComplete")
            : t("sad.toAnswer", { count: left })}
        </p>
        {section.intro && <p>{section.intro}</p>}
      </div>
      {sectionKey === "security-iam" && version.localAuthentication && (
        // Section 8 covers identity and access: its authors see that section 5 says the application authenticates itself.
        <div className="flex max-w-3xl flex-col gap-1">
          <LocalAuthFlag />
          <p className="text-sm">{t("sad.localAuth.section8")}</p>
        </div>
      )}
      {section.groups.map((group) => {
        const questions = group.items.filter(
          (item) => item.type !== "note" && !hidden.has(item.key),
        );
        const refs = group.diagrams ?? [];
        if (questions.length === 0 && refs.length === 0) return null;
        return (
          <div key={group.key} className="flex flex-col gap-5">
            {group.title && <h3 className="heading-3">{group.title}</h3>}
            {group.intro && <p className="max-w-3xl">{group.intro}</p>}
            {group.items.map((item) =>
              item.type === "note" ? (
                <p
                  key={item.key}
                  className="max-w-3xl text-sm text-text-subdued italic"
                >
                  {item.text}
                </p>
              ) : hidden.has(item.key) ? null : (
                // Table questions use the page width; other fields keep a readable one.
                <div
                  key={item.key}
                  className={cn(
                    "flex flex-col gap-5",
                    item.type !== "table" && "max-w-3xl",
                  )}
                >
                  <QuestionField
                    question={item}
                    answer={answers[item.key]}
                    onChange={(answer) => change(item.key, answer)}
                    error={errors[item.key]}
                    context={context}
                  />
                  <QuestionWarning text={warningOf(item, answers)} />
                </div>
              ),
            )}
            <GroupDiagrams
              refs={refs}
              section={sectionKey}
              template={template}
              slots={slots}
              apis={apis}
              drafts={drafts}
              onChange={changeDiagram}
              onImported={(slot, file, diagramIds) =>
                setImports((previous) => [
                  ...previous,
                  { slot, file, diagramIds },
                ])
              }
              errors={diagramErrors}
              versionId={version.id}
              application={version.application.name}
              applicationId={version.application.id}
              load={slotsLoad}
            />
          </div>
        );
      })}
      {section.references.length > 0 && (
        <div className="max-w-3xl text-sm">
          <span className="font-semibold">{t("sad.references")}</span>
          <ul className="list-disc pl-6">
            {section.references.map((reference) => (
              <li key={reference}>{reference}</li>
            ))}
          </ul>
        </div>
      )}
      {conflict || diagramConflict ? (
        <PageMessage
          variant="warning"
          action={
            <Button variant="secondary" onClick={reload}>
              {t("sad.editor.reload")}
            </Button>
          }
        >
          {diagramConflict
            ? t("sad.diagram.conflict", {
                slot: t(`sad.diagram.slots.${diagramConflict}`),
              })
            : t("sad.editor.conflict")}
        </PageMessage>
      ) : (
        <ActionFailed
          error={
            Object.keys(errors).length > 0 ||
            Object.keys(diagramErrors).length > 0
              ? new Error(t("sad.editor.fixErrors"))
              : save.error
          }
        />
      )}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-divider-default bg-surface-default py-3">
        <Button
          type="submit"
          loading={
            save.isPending || saveDiagram.isPending || addUpload.isPending
          }
        >
          {t("sad.editor.save")}
        </Button>
      </div>
    </form>
  );
}

function Editor({
  version,
  template,
}: {
  version: Version;
  template: Template;
}) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const abilities = useSadAbilities();
  const standards = useRetention(abilities.retention);
  const diagrams = useSadDiagrams(version.id);
  const label = useVersionLabel();
  const location = useLocation();
  // The section with unsaved changes (none once saved, or once the author leaves without saving).
  const [dirtySection, setDirtySection] = useState<SadSectionKey | null>(null);
  // Where the section was saved: the message shows until the author moves on.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const readable = version.sections.filter((section) => section.readable);
  const requested = params.get("section");
  const shown =
    readable.find((section) => section.key === requested) ??
    readable.find((section) => section.editable) ??
    readable[0];
  const current = shown.key;
  const rowVersion = shown.rowVersion;
  const name = appName(version.application);
  // The list's active rows, then rows the draft ticks that the list no longer offers (so they can be unticked).
  const listed = (standards.data?.items ?? []).filter((row) => row.active);
  const retention = [
    ...listed,
    ...version.retention.filter(
      (row) => !listed.some((offered) => offered.id === row.id),
    ),
  ];
  const context: FieldContext = {
    trm: version.trm,
    retention,
    retentionFailed: standards.isError
      ? { retry: () => void standards.refetch() }
      : undefined,
    namesHidden: version.namesHidden,
    canSearchApplications: abilities.applications,
  };
  const dirty = dirtySection === current;
  // Asks before leaving with unsaved changes: any link or browser navigation in the app, and closing the tab.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (!dirty) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);

  return (
    <>
      <BackLink to={`/sad/versions/${version.id}`}>
        {t("sad.editor.back")}
      </BackLink>
      <PageHeader
        title={t("sad.editor.title", { name, label: label(version) })}
        intro={t("sad.editor.intro")}
        actions={
          <ButtonLink to={`/sad/versions/${version.id}`} variant="secondary">
            {t("sad.editor.review")}
          </ButtonLink>
        }
      />
      {version.status !== "draft" ? (
        <PageMessage variant="informative">
          {t("sad.editor.notDraft")}
        </PageMessage>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <SectionNav
              template={template}
              version={version}
              current={current}
              to={(key) => `?section=${key}`}
            />
          </aside>
          <div className="flex min-w-0 flex-col gap-4">
            {savedAt === location.key && !dirty && (
              <PageMessage variant="success">
                {t("sad.editor.saved")}
              </PageMessage>
            )}
            <SectionEditor
              key={`${current}-${rowVersion}`}
              version={version}
              template={template}
              sectionKey={current}
              context={context}
              slots={diagrams.data?.items}
              slotsLoad={{
                failed: diagrams.isError,
                retry: () => void diagrams.refetch(),
              }}
              apis={diagrams.data?.apis}
              onDirtyChange={(value) => {
                setDirtySection(value ? current : null);
                if (value) setSavedAt(null);
              }}
              onSaved={() => setSavedAt(location.key)}
            />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title={t("sad.editor.leaveTitle")}
        description={t("sad.editor.leaveIntro")}
        confirmLabel={t("sad.editor.leave")}
        onConfirm={() => {
          setDirtySection(null);
          blocker.proceed?.();
        }}
      />
    </>
  );
}

/** /sad/versions/:versionId/edit?section=… — answer a draft, one section at a time. */
export function SadEditorPage() {
  const { t } = useTranslation();
  const { versionId = "" } = useParams();
  const version = useSadVersion(versionId);
  const template = useSadTemplate();
  if (template.isPending) return <Loading />;
  if (template.isError)
    return <LoadFailed onRetry={() => void template.refetch()} />;
  return (
    <DetailStates query={version} notFound={t("sad.version.notFound")}>
      {(data) => <Editor version={data} template={template.data} />}
    </DetailStates>
  );
}
