import { randomUUID } from 'node:crypto';
import { LockMode } from '@mikro-orm/core';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleInit, UnprocessableEntityException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { z } from 'zod';
import { likePattern, offsetOf } from '../../common/http/pagination.js';
import { StaleUpdateException } from '../../common/http/problem-details.filter.js';
import { RequestValidationException } from '../../common/zod/index.js';
import { FieldClassRegistry, FieldClassService, type FieldClasses } from '../access/field-classes.js';
import type { Principal, ResourceScope } from '../access/principal.js';
import { ApprovalEvent, ApprovalInstance, ApprovalTask } from '../approvals/approval.entities.js';
import { ApprovalWorkflowRegistry, type ApprovalStatusEvent } from '../approvals/approval-workflow.registry.js';
import { ApprovalService, type ApprovalChange } from '../approvals/approval.service.js';
import type { InstanceStatus } from '../approvals/domain/engine.js';
import { AuditService } from '../audit/audit.service.js';
import { personName } from '../identity/person-name.js';
import { SadUploadFiles } from './sad-upload-files.js';
import { User } from '../identity/user.entity.js';
import { TrmApplication, TrmApplicationPortfolio, TrmApplicationService, TrmServiceServer } from '../trm/trm.entities.js';
import { trmVisibility } from '../trm/trm-visibility.js';
import { currentAnswers, sectionAnswersSchema, settleRefs, shownAnswers, type SectionAnswers } from './domain/answers.js';
import {
  changedViews,
  copyIntegration,
  DIAGRAM_SLOTS,
  emptyContent,
  hiddenParts,
  newApiLinks,
  newPicks,
  restoreFacts,
  settlePicks,
  SLOT_OWNER,
  SLOT_VIEWS,
  slotContentSchema,
  VIEW_EDITORS,
  withoutFacts,
  type DiagramContent,
  type DiagramSlot,
  type DiagramView,
} from './domain/diagrams.js';
import { versionHistory, type SadHistoryRow } from './domain/history.js';
import { LOCAL_AUTHENTICATION, usesLocalAuthentication } from './domain/local-auth.js';
import { applyHosting, withHosting } from './domain/infrastructure.js';
import { callsOf } from './domain/mapping.js';
import { SadDiagramDefaultsService } from './sad-diagram-defaults.service.js';
import { keepPersonal, maskPersonal, type HiddenNames } from './domain/personal.js';
import { SAD_SECTION_KEYS, SAD_SECTIONS, sadRead, sadUpdate, type SadSectionKey } from './domain/sections.js';
import { SAD_TEMPLATE, SAD_TEMPLATE_VERSION } from './domain/template.js';
import { isQuestion, type Section, type TrmSource } from './domain/template-types.js';
import { evaluate, type SadAnswers, type SadDiagrams, type TrmValues } from './domain/visibility.js';
import { pdfHistory, type PdfHistoryRow } from './sad-pdf.js';
import { SAD_API_PEOPLE, SAD_APPLICATION_PEOPLE, SAD_FIELDS, SAD_VERSION_PEOPLE } from './sad-fields.js';
import { loadSadTrm, maskTrm, type SadTrm } from './sad-trm.js';
import { OPEN_STATUSES, SadApi, SadDiagram, SadDocument, SadRetentionStandard, SadSection, SadVersion, type RetentionValues } from './sad.entities.js';
import { retentionValues } from './sad-retention.service.js';
import type { SadApiQuery, SadListQuery, SaveSadDiagram, SaveSadSection } from './sad.schemas.js';

export const SAD_WORKFLOW = 'sad-version';
const PERMISSION_CODES = SAD_SECTION_KEYS.flatMap((key) => [sadRead(key), sadUpdate(key)]);

const sectionOf = new Map(SAD_TEMPLATE.sections.flatMap((section) => section.groups.flatMap((group) => group.items.filter(isQuestion).map((q) => [q.key, section.key] as const))));
const sectionDef = (key: SadSectionKey): Section => SAD_TEMPLATE.sections.find((section) => section.key === key)!;
/** The inventory column of an API's URL in each environment. */
const API_URL_OF = { production: 'productionUrl', uat: 'uatUrl', dev: 'devUrl' } as const;
/** The version's status while its approval has each status. */
const VERSION_STATUS_OF: Record<InstanceStatus, SadVersion['status']> = { in_progress: 'in_approval', awaiting_info: 'in_approval', returned: 'draft', cancelled: 'draft', approved: 'current' };
/** The TRM values each section's questions show. */
const TRM_SOURCES_OF = new Map(SAD_TEMPLATE.sections.map((section) => [section.key, section.groups.flatMap((group) => group.items.filter(isQuestion)).flatMap((q) => (q.type === 'trm' ? [q.source] : []))]));
/** The section of the backup schedule (standard retention rows). */
const BACKUP_SECTION = sectionOf.get('backup-schedule')!;
/** The standard rows a backup schedule answer ticks. */
const tickedRetention = (answers: SectionAnswers): string[] => {
  const envelope = answers['backup-schedule'];
  return envelope && 'value' in envelope ? (envelope.value as { rows: { standardId: string }[] }).rows.map((row) => row.standardId) : [];
};
const titleOf = (key: SadSectionKey) => SAD_SECTIONS.find((section) => section.key === key)!.title;
/** The sections that show each diagram slot (in any view): readers of any of them see the slot. */
const slotSections = new Map(
  DIAGRAM_SLOTS.map((slot) => [slot, new Set(SAD_TEMPLATE.sections.filter((section) => section.groups.some((group) => group.diagrams?.some((ref) => ref.slot === slot))).map((section) => section.key))]),
);
/** The sections that show each view of each slot ("<slot>/<view>"): readers of any of them read that view. */
const viewSections = new Map<string, Set<SadSectionKey>>();
for (const section of SAD_TEMPLATE.sections) {
  for (const { slot, view } of section.groups.flatMap((group) => group.diagrams ?? [])) {
    viewSections.set(`${slot}/${view}`, (viewSections.get(`${slot}/${view}`) ?? new Set()).add(section.key));
  }
}
/** Sections whose diagrams link TRM applications: solution and integration (2), infrastructure (3), monitoring (12). */
export const TRM_LINKERS: readonly SadSectionKey[] = ['solution-integration', 'network', 'logging'];
type Pick = { path: (string | number)[]; id: string };
/** What each view's editors change, for refusals. */
const PART_NAMES: Record<DiagramView, string> = {
  solution: 'blocks and connections',
  'data-flow': 'data flow facts',
  infrastructure: 'zones, boxes and infrastructure lines',
  integration: 'integration connections',
  process: 'process flows',
  monitoring: 'monitoring diagram',
};
/** Nullable columns load as null; MikroORM's types also allow undefined. */
const col = <T>(value: T | null | undefined) => value as T | null;

interface Access {
  /** Sections the caller can view (an approver of the version sees them all) */
  readable: Set<SadSectionKey>;
  editable: Set<SadSectionKey>;
  /** Which people's names the caller sees (field classes sad.*-people) */
  names: { application: boolean; api: boolean; version: boolean };
}

const hiddenNames = (access: Access): HiddenNames => ({ questions: !access.names.application, columns: !access.names.api });

interface Loaded {
  version: SadVersion;
  trm: SadTrm;
  access: Access;
  asApprover: boolean;
}

interface ApiRow {
  id?: string;
  cells: Record<string, unknown>;
}

/** Gives every table row a stable id, so later saves can match rows. */
function withRowIds(answers: SectionAnswers): SectionAnswers {
  return Object.fromEntries(
    Object.entries(answers).map(([key, envelope]) => [
      key,
      'value' in envelope && Array.isArray(envelope.value) && envelope.value.every((row) => typeof row === 'object' && row !== null && 'cells' in row)
        ? { value: (envelope.value as ApiRow[]).map((row) => ({ ...row, id: row.id ?? randomUUID() })) }
        : envelope,
    ]),
  );
}

@Injectable()
export class SadService implements OnModuleInit {
  private readonly logger = new Logger(SadService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalService,
    private readonly registry: ApprovalWorkflowRegistry,
    private readonly fieldClasses: FieldClassService,
    private readonly diagramDefaults: SadDiagramDefaultsService,
    private readonly uploadFiles: SadUploadFiles,
    fieldRegistry: FieldClassRegistry,
  ) {
    fieldRegistry.register(...SAD_FIELDS);
  }

  onModuleInit(): void {
    this.registry.register({
      code: SAD_WORKFLOW,
      name: 'SAD version',
      description: "A new version of an application's Solution Architecture Document",
      contextSchema: z.object({ applicationId: z.uuid(), firstVersion: z.boolean() }),
      approversSeeFinancials: false,
      onStatusChange: (event) => this.onApprovalStatus(event),
      // Resubmitting in the Approval Centre runs the SAD's own Submit (completeness, snapshots, submitter).
      resubmit: (principal, versionId) => this.submit(principal, versionId),
    });
  }

  // ----- Access

  private access(principal: Principal, scope: ResourceScope, classes: FieldClasses): Access {
    const editable = new Set(SAD_SECTION_KEYS.filter((key) => principal.can(sadUpdate(key), scope)));
    const readable = new Set(SAD_SECTION_KEYS.filter((key) => editable.has(key) || principal.can(sadRead(key), scope)));
    const see = classes.viewer(principal, { scope });
    return { readable, editable, names: { application: see(SAD_APPLICATION_PEOPLE), api: see(SAD_API_PEOPLE), version: see(SAD_VERSION_PEOPLE) } };
  }

  /** Applications where the caller holds one of the permissions: null means all of them. */
  private async visibleApplications(em: EntityManager, principal: Principal, codes: readonly string[]): Promise<Set<string> | null> {
    if (principal.isSystemAdmin) return null;
    const grants = principal.grants.filter((grant) => codes.some((code) => grant.permissions.has(code)));
    if (grants.some((grant) => grant.scope.scopeType === 'global')) return null;
    const ids = new Set<string>();
    const portfolios: string[] = [];
    for (const { scope } of grants) {
      if (scope.scopeType === 'application' && scope.scopeId) ids.add(scope.scopeId);
      if (scope.scopeType === 'portfolio' && scope.scopeId) portfolios.push(scope.scopeId);
    }
    for (const link of await em.find(TrmApplicationPortfolio, { portfolio: { $in: portfolios } })) ids.add(link.application.id);
    return ids;
  }

  /** Approvers see the whole version from when their task is active, and keep that after acting. */
  private async isApprover(em: EntityManager, principal: Principal, version: SadVersion): Promise<boolean> {
    if (!version.approvalInstanceId) return false;
    return (await em.count(ApprovalTask, { instance: version.approvalInstanceId, assignee: principal.user.id, activatedAt: { $ne: null } })) > 0;
  }

  private async load(em: EntityManager, principal: Principal, versionId: string): Promise<Loaded> {
    const version = await em.findOne(SadVersion, { id: versionId, status: { $ne: 'cancelled' } }, { populate: ['document', 'startedBy', 'submittedBy'] });
    const trm = version ? await loadSadTrm(em, version.document.application.id) : null;
    if (!version || !trm) throw new NotFoundException('SAD version not found');
    const access = this.access(principal, trm.scope, await this.fieldClasses.classes(em));
    let asApprover = false;
    if (access.readable.size < SAD_SECTION_KEYS.length && (await this.isApprover(em, principal, version))) {
      asApprover = true;
      access.readable = new Set(SAD_SECTION_KEYS);
    }
    if (access.readable.size === 0) throw new NotFoundException('SAD version not found');
    return { version, trm, access, asApprover };
  }

  /** A version's answers: the questions the template asks, plus (approved versions) answers to questions later templates removed. */
  private async answersOf(em: EntityManager, versionId: string, approved = false): Promise<{ rows: SadSection[]; answers: SadAnswers }> {
    const rows = await em.find(SadSection, { sadVersion: versionId });
    return { rows, answers: Object.fromEntries(rows.map((row) => [row.section, shownAnswers(sectionDef(row.section), row.answers, approved)])) };
  }

  private async diagramsOf(em: EntityManager, versionId: string): Promise<{ rows: SadDiagram[]; diagrams: SadDiagrams }> {
    const rows = await em.find(SadDiagram, { sadVersion: versionId });
    return { rows, diagrams: Object.fromEntries(rows.map((row) => [row.slot, row.content])) };
  }

  private person(user: User | null | undefined, personal: boolean) {
    return user && personal ? { id: user.id, name: personName(user) } : null;
  }

  private outcome(answers: SadAnswers, trm: TrmValues, readable: Set<SadSectionKey>, diagrams: SadDiagrams) {
    const evaluation = evaluate(SAD_TEMPLATE, answers, trm, diagrams);
    return {
      // Nothing about sections the reader cannot view: no counts, no hidden questions.
      completion: evaluation.sections.filter((section) => readable.has(section.section)),
      hidden: [...evaluation.hidden].filter((key) => readable.has(sectionOf.get(key)!)),
    };
  }

  // ----- Reading

  /** Each application's scope (with its portfolios), for checking permissions on many applications at once. */
  private async scopesOf(em: EntityManager, ids: string[]): Promise<(id: string) => ResourceScope> {
    const links = await em.find(TrmApplicationPortfolio, { application: { $in: ids } });
    return (id) => ({ applicationId: id, applicationIds: [id], portfolioIds: links.filter((link) => link.application.id === id).map((link) => link.portfolio.id) });
  }

  /**
   * Applications flagged for local authentication, from the current version's section 5, else (no approved version
   * yet) the open draft's; only those whose section 5 the reader can read.
   */
  private async localAuthentication(em: EntityManager, principal: Principal, applications?: string[]): Promise<Map<string, 'approved' | 'draft'>> {
    const flagged = await em.find(
      SadSection,
      {
        section: 'security-design',
        $or: LOCAL_AUTHENTICATION.map((selected) => ({ answers: { $contains: { 'authentication-method': { value: { selected } } } } })),
        sadVersion: { status: { $in: ['current', ...OPEN_STATUSES] }, ...(applications ? { document: { application: { $in: applications } } } : {}) },
      },
      { populate: ['sadVersion.document'] },
    );
    const scopeOf = await this.scopesOf(em, flagged.map((row) => row.sadVersion.document.application.id));
    const result = new Map<string, 'approved' | 'draft'>();
    for (const { sadVersion: version } of flagged) {
      const id = version.document.application.id;
      if (!principal.can(sadRead('security-design'), scopeOf(id)) && !principal.can(sadUpdate('security-design'), scopeOf(id))) continue;
      if (version.status === 'current') result.set(id, 'approved');
      // A draft counts only while no version is approved.
      else if (version.document.lastNumber === 0) result.set(id, 'draft');
    }
    return result;
  }

  template() {
    return SAD_TEMPLATE;
  }

  async list(principal: Principal, query: SadListQuery) {
    const em = this.em.fork();
    const visible = await this.visibleApplications(em, principal, PERMISSION_CODES);
    const where: FilterQuery<TrmApplication> = {};
    let include = visible;
    let exclude = new Set<string>();
    if (query.status) {
      const open = await em.find(SadVersion, { status: { $in: OPEN_STATUSES } }, { populate: ['document'] });
      const current = (await em.find(SadDocument, { lastNumber: { $gt: 0 } })).map((d) => d.application.id);
      const matching =
        query.status === 'current' ? current : query.status === 'none' ? null : open.filter((v) => v.status === query.status).map((v) => v.document.application.id);
      if (matching) include = new Set((include ? [...include] : matching).filter((id) => matching.includes(id)));
      else exclude = new Set([...current, ...open.map((v) => v.document.application.id)]);
    }
    if (query.authentication === 'local') {
      const flagged = [...(await this.localAuthentication(em, principal)).keys()];
      include = new Set((include ? [...include] : flagged).filter((id) => flagged.includes(id)));
    }
    if (include) where.id = { $in: [...include].filter((id) => !exclude.has(id)) };
    else if (exclude.size > 0) where.id = { $nin: [...exclude] };
    if (query.q) {
      const pattern = likePattern(query.q);
      where.$or = [{ name: { $ilike: pattern } }, { displayName: { $ilike: pattern } }, { number: { $ilike: pattern } }];
    }
    const [applications, total] = await em.findAndCount(TrmApplication, where, { ...offsetOf(query), orderBy: { name: 'asc', id: 'asc' }, fields: ['name', 'number'] });
    const documents = await em.find(SadDocument, { application: { $in: applications.map((a) => a.id) } });
    const versions = await em.find(SadVersion, { document: { $in: documents.map((d) => d.id) }, status: { $in: [...OPEN_STATUSES, 'current'] } }, { populate: ['document'] });
    const local = await this.localAuthentication(em, principal, applications.map((a) => a.id));
    return {
      items: applications.map((application) => {
        const mine = versions.filter((v) => v.document.application.id === application.id);
        const current = mine.find((v) => v.status === 'current');
        const open = mine.find((v) => v.status !== 'current');
        return {
          applicationId: application.id,
          name: col(application.name),
          number: col(application.number),
          current: current ? { versionId: current.id, number: current.number!, approvedAt: current.approvedAt! } : null,
          open: open ? { versionId: open.id, status: open.status as 'draft' | 'in_approval' } : null,
          localAuthentication: local.get(application.id) ?? null,
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async overview(principal: Principal, applicationId: string) {
    const em = this.em.fork();
    const trm = await loadSadTrm(em, applicationId);
    const access = trm ? this.access(principal, trm.scope, await this.fieldClasses.classes(em)) : null;
    if (!trm || !access || access.readable.size === 0) throw new NotFoundException('SAD not found');
    const document = await em.findOne(SadDocument, { application: applicationId });
    const versions = document
      ? await em.find(SadVersion, { document, status: { $ne: 'cancelled' } }, { populate: ['startedBy'], orderBy: { number: 'desc', createdAt: 'desc' } })
      : [];
    const current = versions.find((v) => v.status === 'current');
    const open = versions.find((v) => OPEN_STATUSES.includes(v.status));
    const instance = open?.approvalInstanceId ? await em.findOne(ApprovalInstance, open.approvalInstanceId) : null;
    return {
      application: trm.application,
      current: current ? { versionId: current.id, number: current.number!, approvedAt: current.approvedAt! } : null,
      open: open
        ? {
            versionId: open.id,
            status: open.status as 'draft' | 'in_approval',
            // An open version always has its document.
            draftOf: document!.lastNumber + 1,
            startedBy: this.person(open.startedBy, access.names.version),
            startedAt: open.createdAt,
            submittedAt: col(open.submittedAt),
            approvalInstanceId: col(open.approvalInstanceId),
            approvalStatus: instance ? instance.status : null,
          }
        : null,
      history: versions
        .filter((v) => v.status === 'current' || v.status === 'superseded')
        .map((v) => ({ versionId: v.id, number: v.number!, approvedAt: v.approvedAt!, status: v.status as 'current' | 'superseded' })),
      readable: SAD_SECTION_KEYS.filter((key) => access.readable.has(key)),
      editable: SAD_SECTION_KEYS.filter((key) => access.editable.has(key)),
      canStartDraft: access.editable.size > 0 && !open,
      localAuthentication: (await this.localAuthentication(em, principal, [applicationId])).get(applicationId) ?? null,
    };
  }

  async version(principal: Principal, versionId: string) {
    const em = this.em.fork();
    const { version, trm, access, asApprover } = await this.load(em, principal, versionId);
    return this.view(em, principal, { version, trm, access, asApprover });
  }

  private async view(em: EntityManager, principal: Principal, { version, trm, access, asApprover }: Loaded) {
    const { rows, answers } = await this.answersOf(em, version.id, version.status === 'current' || version.status === 'superseded');
    const { diagrams } = await this.diagramsOf(em, version.id);
    const live = version.status === 'draft' || !version.trmSnapshot;
    const values = live ? trm.values : (version.trmSnapshot as TrmValues);
    const instance = version.approvalInstanceId ? await em.findOne(ApprovalInstance, version.approvalInstanceId) : null;
    const draft = version.status === 'draft';
    const editable = (key: SadSectionKey) => draft && access.editable.has(key);
    const shown = (key: SadSectionKey, sectionAnswers: SectionAnswers) => maskPersonal(sectionDef(key), sectionAnswers, hiddenNames(access));
    return {
      id: version.id,
      application: trm.application,
      status: version.status,
      number: col(version.number),
      draftOf: OPEN_STATUSES.includes(version.status) ? version.document.lastNumber + 1 : null,
      templateVersion: version.templateVersion,
      startedBy: this.person(version.startedBy, access.names.version),
      startedAt: version.createdAt,
      submittedBy: this.person(version.submittedBy, access.names.version),
      submittedAt: col(version.submittedAt),
      approvedAt: col(version.approvedAt),
      approvalInstanceId: col(version.approvalInstanceId),
      approvalStatus: instance ? instance.status : null,
      asApprover,
      namesHidden: !(access.names.application && access.names.api && access.names.version),
      trm: this.trmFor(values, access, live),
      sections: SAD_SECTION_KEYS.map((key) => {
        const row = rows.find((r) => r.section === key);
        return { key, readable: access.readable.has(key), editable: editable(key), rowVersion: row?.version ?? 0, answers: access.readable.has(key) ? shown(key, answers[key] ?? {}) : null };
      }),
      ...this.outcome(answers, values, access.readable, diagrams),
      canSubmit: draft && access.editable.size > 0,
      canCancel: draft && (version.startedBy.id === principal.user.id || principal.can('sad:draft:manage', trm.scope)),
      retention: await this.retentionOf(em, version, answers, access.readable),
      localAuthentication: access.readable.has('security-design') ? usesLocalAuthentication(answers['security-design']) : null,
      history: (await this.history(em, version)).map((row) => ({ ...row, user: this.person(row.user, access.names.version) })),
    };
  }

  /** The TRM values the reader's sections show (their TRM questions), people's names masked unless allowed. */
  private trmFor(values: TrmValues, access: Access, live: boolean) {
    const sources = new Set([...access.readable].flatMap((key) => TRM_SOURCES_OF.get(key)!));
    if (sources.size === 0) return null;
    const masked = maskTrm(values, access.names.application);
    const shown = Object.fromEntries(Object.entries(masked.values).filter(([source]) => sources.has(source as TrmSource)));
    return { values: shown, restricted: masked.restricted.filter((source) => sources.has(source)), live };
  }

  /** The template's Version Control rows: from the events of every approval of the version (tasks change as an approval moves on). */
  private async history(em: EntityManager, version: SadVersion): Promise<SadHistoryRow<User>[]> {
    const events = await em.find(ApprovalEvent, { instance: { workflowCode: SAD_WORKFLOW, subjectId: version.id } }, { populate: ['actor', 'instance'], orderBy: { at: 'asc' } });
    const stepName = (event: ApprovalEvent) => event.instance.steps.find((step) => step.key === event.stepKey)!.name;
    return versionHistory(
      { by: version.startedBy, at: version.createdAt },
      events.map((event) => ({ action: event.action, actor: event.actor, step: stepName(event), comment: col(event.comment), at: event.at })),
      col(version.approvedAt),
    );
  }

  /** The version as its reader sees it, plus the template's Version Control rows (for the PDF). */
  async exportData(principal: Principal, versionId: string): Promise<{ view: Awaited<ReturnType<SadService['version']>>; history: PdfHistoryRow[] }> {
    const em = this.em.fork();
    const loaded = await this.load(em, principal, versionId);
    const view = await this.view(em, principal, loaded);
    const { version, access } = loaded;
    const who = (user: User | null) => (user ? (access.names.version ? personName(user) : 'Restricted') : null);
    const label = version.number ? String(version.number) : `Draft of ${version.document.lastNumber + 1}`;
    const rows = await this.history(em, version);
    return { view, history: pdfHistory(rows.map((row) => ({ ...row, user: who(row.user) })), label) };
  }

  // ----- Drafts

  async startDraft(principal: Principal, applicationId: string) {
    const em = this.em.fork();
    const trm = await loadSadTrm(em, applicationId);
    const access = trm ? this.access(principal, trm.scope, await this.fieldClasses.classes(em)) : null;
    if (!trm || !access || access.readable.size === 0) throw new NotFoundException('SAD not found');
    if (access.editable.size === 0) throw new ForbiddenException('You cannot edit any section of this SAD.');
    const draft = await em.transactional(async (tx) => {
      // Create the document once, then lock it: concurrent "start draft" requests queue here.
      await tx.upsert(SadDocument, { application: tx.getReference(TrmApplication, applicationId), lastNumber: 0, createdBy: principal.user.id, updatedBy: principal.user.id }, { onConflictFields: ['application'], onConflictAction: 'ignore' });
      const document = await tx.findOneOrFail(SadDocument, { application: applicationId }, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      if ((await tx.count(SadVersion, { document, status: { $in: OPEN_STATUSES } })) > 0) throw new ConflictException('This SAD already has an open draft.');
      const created = tx.create(SadVersion, {
        document,
        status: 'draft',
        templateVersion: SAD_TEMPLATE_VERSION,
        startedBy: tx.getReference(User, principal.user.id),
        createdBy: principal.user.id,
        updatedBy: principal.user.id,
      });
      const current = await tx.findOne(SadVersion, { document, status: 'current' });
      for (const section of current ? await tx.find(SadSection, { sadVersion: current }) : []) {
        const answers = currentAnswers(sectionDef(section.section), section.answers);
        tx.create(SadSection, { sadVersion: created, section: section.section, answers, createdBy: principal.user.id, updatedBy: principal.user.id });
      }
      for (const diagram of current ? await tx.find(SadDiagram, { sadVersion: current }) : []) {
        tx.create(SadDiagram, { sadVersion: created, slot: diagram.slot, content: diagram.content, createdBy: principal.user.id, updatedBy: principal.user.id });
      }
      if (current) await this.uploadFiles.carry(tx, current, created, principal.user.id);
      return created;
    });
    await this.audit.recordChange(principal, 'sad.draft.started', 'sad-version', draft.id, { before: null, after: { applicationId, status: 'draft' } });
    return { id: draft.id, status: draft.status, approvalInstanceId: null };
  }

  async saveSection(principal: Principal, versionId: string, key: SadSectionKey, body: SaveSadSection) {
    const em = this.em.fork();
    const loaded = await this.load(em, principal, versionId);
    if (!loaded.access.editable.has(key)) throw new ForbiddenException('You cannot edit this section.');
    const section = sectionDef(key);
    const parsed = sectionAnswersSchema(section).safeParse(body.answers);
    if (!parsed.success) {
      throw new RequestValidationException(parsed.error.issues.map((issue) => ({ path: ['answers', ...issue.path].join('.'), message: issue.message })));
    }
    let answers = withRowIds(parsed.data);
    const { before, row } = await em.transactional(async (tx) => {
      const version = await tx.findOneOrFail(SadVersion, versionId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (version.status !== 'draft') throw new ConflictException('Only a draft can be edited.');
      let row = await tx.findOne(SadSection, { sadVersion: versionId, section: key });
      const before = row?.answers ?? {};
      if ((row?.version ?? 0) !== body.version) {
        const latest = { rowVersion: row?.version ?? 0, answers: maskPersonal(section, currentAnswers(section, before), hiddenNames(loaded.access)) };
        throw new StaleUpdateException('Someone else changed this section. Their latest is included: reload it, then make your changes again.', latest);
      }
      answers = keepPersonal(section, answers, before, hiddenNames(loaded.access));
      answers = await this.namedRefs(tx, section, answers);
      await this.checkRetentionRows(tx, answers);
      if (row) {
        row.answers = answers;
        row.updatedBy = principal.user.id;
      } else {
        row = tx.create(SadSection, { sadVersion: version, section: key, answers, createdBy: principal.user.id, updatedBy: principal.user.id });
      }
      version.updatedBy = principal.user.id;
      return { before, row };
    });
    await this.audit.recordChange(principal, 'sad.section.saved', 'sad-version', versionId, { before: { [key]: before }, after: { [key]: answers } }, { section: key });
    const all = await this.answersOf(em, versionId);
    const { diagrams } = await this.diagramsOf(em, versionId);
    return {
      section: key,
      rowVersion: row.version,
      answers: maskPersonal(section, answers, hiddenNames(loaded.access)),
      ...this.outcome(all.answers, loaded.trm.values, loaded.access.readable, diagrams),
    };
  }

  // ----- Diagrams (SAD part 2)

  /**
   * The views of a slot the caller reads (through any section showing them; other views' connection facts are
   * left out) and edits (through each view's editing section, on drafts).
   */
  private views(slot: DiagramSlot, access: Access, draft: boolean) {
    const readable = SLOT_VIEWS[slot].filter((view) => [...viewSections.get(`${slot}/${view}`)!].some((key) => access.readable.has(key)));
    const editable = SLOT_VIEWS[slot].filter((view) => {
      const editors = VIEW_EDITORS[view];
      return draft && editors !== undefined && access.editable.has(editors);
    });
    return { readable, editable, hidden: SLOT_VIEWS[slot].filter((view) => !readable.includes(view)) };
  }

  /** The APIs in a version's API inventory (section 6 table rows), by id and name. */
  private async apiInventory(em: EntityManager, versionId: string): Promise<{ id: string; name: string }[]> {
    const { answers } = await this.answersOf(em, versionId);
    const envelope = answers['api-inventory']?.apis;
    const rows = envelope && 'value' in envelope ? (envelope.value as ApiRow[]) : [];
    // A draft's row may not have its name yet.
    return rows.flatMap((row) => (row.id ? [{ id: row.id, name: typeof row.cells.name === 'string' ? row.cells.name : '' }] : []));
  }

  /** The diagram slots the caller's sections show, with the views they read and edit (and the API names, for readers of the integration view). */
  async diagrams(principal: Principal, versionId: string) {
    const em = this.em.fork();
    const { version, trm, access } = await this.load(em, principal, versionId);
    const { rows } = await this.diagramsOf(em, versionId);
    const defaults = await this.diagramDefaults.current(em);
    const draft = version.status === 'draft';
    const items = DIAGRAM_SLOTS.filter((slot) => [...slotSections.get(slot)!].some((key) => access.readable.has(key))).map((slot) => {
      const row = rows.find((r) => r.slot === slot);
      const { readable, editable, hidden } = this.views(slot, access, draft);
      const content = row ? withHosting(slot, row.content, defaults) : emptyContent(slot, trm.application.name, defaults);
      return {
        slot,
        owner: SLOT_OWNER[slot].section,
        readableViews: readable,
        editableViews: editable,
        rowVersion: row?.version ?? 0,
        content: withoutFacts(content, hidden),
        hidden: editable.length > 0 ? hiddenParts(content, hidden) : [],
      };
    });
    // API names only (agreed 2026-10-24): readers of section 2 see which API a connection uses, even without section 6;
    // editors of integration connections (and readers of section 6) see every API, to link one.
    const integration = items.find((item) => item.slot === 'infrastructure');
    if (!integration?.readableViews.includes('integration')) return { items, apis: [] };
    const apis = await this.apiInventory(em, versionId);
    if (integration.editableViews.includes('integration') || access.readable.has('api-inventory')) return { items, apis };
    const content = integration.content;
    const linked = new Set('notApplicable' in content ? [] : content.diagrams.flatMap((d) => d.lines.flatMap((line) => (line.api ? [line.api.id] : []))));
    return { items, apis: apis.filter((api) => linked.has(api.id)) };
  }

  /**
   * What the caller may do with each diagram slot of a version, for its files: see the slot (a section that shows it),
   * draw it (its owning section; files change on drafts only), which diagrams it has, and whether they see people's names.
   */
  async slotAccess(principal: Principal, versionId: string) {
    const em = this.em.fork();
    const { version, trm, access } = await this.load(em, principal, versionId);
    const { rows } = await this.diagramsOf(em, versionId);
    const slots = new Map(
      DIAGRAM_SLOTS.map((slot) => {
        // Files go under saved diagrams only: a slot never saved holds none yet.
        const content = rows.find((row) => row.slot === slot)?.content ?? { notApplicable: true as const, reason: '' };
        return [
          slot,
          {
            readable: [...slotSections.get(slot)!].some((key) => access.readable.has(key)),
            drawable: this.views(slot, access, true).editable.includes(SLOT_OWNER[slot].view),
            diagramIds: 'notApplicable' in content ? [] : content.diagrams.map((diagram) => diagram.id),
          },
        ] as const;
      }),
    );
    return { version, application: trm.application, names: access.names.version, slots };
  }

  /** TRM applications a section 2 editor can put on the solution diagram: any of them by name or number (only those two), never the SAD's own. */
  async businessApplications(principal: Principal, versionId: string, q: string) {
    const em = this.em.fork();
    const { version, trm, access } = await this.load(em, principal, versionId);
    if (version.status !== 'draft' || !TRM_LINKERS.some((key) => access.editable.has(key))) throw new ForbiddenException('You cannot add business applications to this diagram.');
    const pattern = likePattern(q);
    const found = await em.find(
      TrmApplication,
      { id: { $ne: trm.application.id }, name: { $ne: null }, $or: [{ name: { $ilike: pattern } }, { displayName: { $ilike: pattern } }, { number: { $ilike: pattern } }] },
      { orderBy: { name: 'asc', id: 'asc' }, limit: 20 },
    );
    return { items: found.map((application) => ({ id: application.id, number: col(application.number), name: application.name! })) };
  }

  /**
   * Calls between an application and others, from every application's latest approved SAD (one row per SAD that
   * says it). For anyone who can see the application in TRM or read section 2 of its SAD; what a call does only for
   * readers of section 2 of the SAD it comes from. Applications show their name and APM number only.
   */
  async applicationCalls(principal: Principal, applicationId: string) {
    const em = this.em.fork();
    const scopes = (ids: string[]) => this.scopesOf(em, ids);
    const reads = (scope: ResourceScope) => principal.can(sadRead('solution-integration'), scope) || principal.can(sadUpdate('solution-integration'), scope);
    const visibility = await trmVisibility(em, principal);
    const seen = (await em.count(TrmApplication, applicationId)) > 0 && (visibility.all || visibility.applications.has(applicationId) || reads((await scopes([applicationId]))(applicationId)));
    if (!seen) throw new NotFoundException('Application not found');

    // Only the approved solution diagrams that can name the application: its own SAD's, and those with a block linked to it.
    const rows = await em.find(
      SadDiagram,
      {
        slot: 'solution',
        sadVersion: { status: 'current' },
        $or: [{ sadVersion: { document: { application: applicationId } } }, { content: { $contains: { diagrams: [{ boxes: [{ application: { id: applicationId } }] }] } } }],
      },
      { populate: ['sadVersion.document'], orderBy: { id: 'asc' } },
    );
    const found = rows.flatMap((row) => {
      const version = row.sadVersion;
      const owner = version.document.application.id;
      return callsOf(owner, row.content)
        .filter((call) => call.caller === applicationId || call.callee === applicationId)
        .map((call) => ({ ...call, version, owner }));
    });
    const ids = [...new Set(found.flatMap((call) => [call.caller, call.callee, call.owner]))];
    const apps = new Map((await em.find(TrmApplication, { id: { $in: ids } })).map((app) => [app.id, app]));
    const scopeOf = await scopes([...new Set(found.map((call) => call.owner))]);
    const named = (id: string, drawn: { label: string; number: string | null }) => {
      const app = apps.get(id);
      // An application gone from TRM shows as its block was picked.
      return app ? { id, name: col(app.name), number: col(app.number) } : { id, name: drawn.label, number: drawn.number };
    };
    const items = found.map((call) => {
      const restricted = !reads(scopeOf(call.owner));
      return {
        caller: named(call.caller, call.other),
        callee: named(call.callee, call.other),
        calls: restricted ? null : call.calls,
        does: restricted ? null : call.does,
        restricted,
        twoWay: call.twoWay,
        source: { applicationId: call.owner, applicationName: col(apps.get(call.owner)!.name), versionId: call.version.id, number: call.version.number!, approvedAt: call.version.approvedAt!.toISOString() },
      };
    });
    return { items: items.sort((a, b) => (a.source.applicationName ?? '').localeCompare(b.source.applicationName ?? '')) };
  }

  /** The application's TRM servers, through its services. */
  private async applicationServers(em: EntityManager, applicationId: string): Promise<{ id: string; name: string }[]> {
    const services = (await em.find(TrmApplicationService, { application: applicationId })).map((link) => link.service.id);
    const links = await em.find(TrmServiceServer, { service: { $in: services } }, { populate: ['server'] });
    const servers = new Map(links.map((link) => [link.server.id, { id: link.server.id, name: link.server.name }]));
    return [...servers.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The application's TRM servers, for section 3 editors to put on a draft's infrastructure diagram. */
  async servers(principal: Principal, versionId: string) {
    const em = this.em.fork();
    const { version, trm, access } = await this.load(em, principal, versionId);
    if (version.status !== 'draft' || !access.editable.has('network')) throw new ForbiddenException('You cannot add servers to this diagram.');
    return { items: await this.applicationServers(em, trm.application.id) };
  }

  /** The TRM name of each newly picked server; only the application's own servers can be picked. */
  /** TRM's current name of each linked server (new links must be the application's own servers). */
  private async serverPicks(em: EntityManager, applicationId: string, linked: Pick[], fresh: Pick[]): Promise<Map<string, { name: string; number: null }>> {
    if (linked.length === 0) return new Map();
    const servers = new Map((await this.applicationServers(em, applicationId)).map((server) => [server.id, server]));
    const errors = fresh.filter(({ id }) => !servers.has(id)).map(({ path }) => ({ path: ['content', ...path].join('.'), message: 'Not a TRM server of this application' }));
    if (errors.length > 0) throw new RequestValidationException(errors);
    return new Map(linked.filter(({ id }) => servers.has(id)).map(({ id }) => [id, { name: servers.get(id)!.name, number: null }]));
  }

  /** An integration connection newly linked to an API must link to one in this version's API inventory. */
  private async checkApiLinks(em: EntityManager, versionId: string, links: { path: (string | number)[]; id: string }[]): Promise<void> {
    if (links.length === 0) return;
    const apis = new Set((await this.apiInventory(em, versionId)).map((api) => api.id));
    const errors = links.filter(({ id }) => !apis.has(id)).map(({ path }) => ({ path: ['content', ...path].join('.'), message: "Not an API in this SAD's API inventory" }));
    if (errors.length > 0) throw new RequestValidationException(errors);
  }

  /** TRM's current name and number of each linked application; new links to unknown (or unnamed) applications or the SAD's own are refused. */
  private async picks(em: EntityManager, own: string, linked: Pick[], fresh: Pick[]): Promise<Map<string, { name: string; number: string | null }>> {
    if (linked.length === 0) return new Map();
    const found = new Map((await em.find(TrmApplication, { id: { $in: linked.map((p) => p.id) }, name: { $ne: null } })).map((a) => [a.id, a]));
    const errors = fresh.flatMap(({ path, id }) => {
      if (id === own) return [{ path: ['content', ...path].join('.'), message: 'Use "Part of this application" blocks for the application itself' }];
      return found.has(id) ? [] : [{ path: ['content', ...path].join('.'), message: 'Not a TRM application' }];
    });
    if (errors.length > 0) throw new RequestValidationException(errors);
    return new Map([...found.values()].map((a) => [a.id, { name: a.name!, number: col(a.number) }]));
  }

  /**
   * Saves a slot. Each editor changes only the parts of the views their sections edit; facts of views they
   * cannot read are kept as stored, and business applications keep the TRM name and number they were picked with.
   */
  async saveDiagram(principal: Principal, versionId: string, slot: DiagramSlot, body: SaveSadDiagram) {
    const em = this.em.fork();
    const loaded = await this.load(em, principal, versionId);
    const { editable, hidden } = this.views(slot, loaded.access, true);
    if (editable.length === 0) throw new ForbiddenException('You cannot edit this diagram.');
    if (body.copyFromProduction && (slot !== 'infrastructure' || !editable.includes('infrastructure'))) {
      throw new ForbiddenException('Only the editors of the infrastructure diagram copy production to non-production.');
    }
    // Section 3 copying production: the API copies the integration connections it may not change (or see).
    const copied = body.copyFromProduction === true && !editable.includes('integration');
    const invalid = (issues: readonly { path: PropertyKey[]; message: string }[]) =>
      new RequestValidationException(issues.map((issue) => ({ path: ['content', ...issue.path].join('.'), message: issue.message })));
    const parsed = slotContentSchema(slot).safeParse(body.content);
    if (!parsed.success) throw invalid(parsed.error.issues);
    const { before, row, content, unused } = await em.transactional(async (tx) => {
      const version = await tx.findOneOrFail(SadVersion, versionId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (version.status !== 'draft') throw new ConflictException('Only a draft can be edited.');
      let row = await tx.findOne(SadDiagram, { sadVersion: versionId, slot });
      const before = row?.content ?? null;
      const defaults = await this.diagramDefaults.current(tx);
      // A diagram drawn before the hosting settings existed is compared with them filled in, as everyone sees it.
      const stored = before ? withHosting(slot, before, defaults) : emptyContent(slot, loaded.trm.application.name, defaults);
      if ((row?.version ?? 0) !== body.version) {
        const latest = { rowVersion: row?.version ?? 0, content: withoutFacts(stored, hidden) };
        throw new StaleUpdateException('Someone else changed this diagram. Their latest is included: reload it, then make your changes again.', latest);
      }
      const merged = restoreFacts(stored, parsed.data, hidden);
      const restored = copied ? copyIntegration(merged) : merged;
      const application = loaded.trm.application.id;
      const picked = settlePicks(stored, restored, await this.picks(tx, application, newPicks(null, restored), newPicks(stored, restored)));
      const servers = await this.serverPicks(tx, application, newPicks(null, picked, 'server'), newPicks(stored, picked, 'server'));
      const content: DiagramContent = applyHosting(settlePicks(stored, picked, servers, 'server'));
      // What was put back for the editor (lines and facts they cannot see) must still fit: e.g. ids no one else uses.
      const checked = slotContentSchema(slot).safeParse(content);
      if (!checked.success) throw invalid(checked.error.issues);
      await this.checkApiLinks(tx, versionId, newApiLinks(stored, content));
      const refused = [...changedViews(slot, stored, content, { copied })].find((view) => !editable.includes(view));
      if (refused) throw new ForbiddenException(`You cannot change the ${PART_NAMES[refused]} on this diagram.`);
      if (row) {
        row.content = content;
        row.updatedBy = principal.user.id;
      } else {
        row = tx.create(SadDiagram, { sadVersion: version, slot, content, createdBy: principal.user.id, updatedBy: principal.user.id });
      }
      version.updatedBy = principal.user.id;
      // Files under a diagram removed from the slot (or all, when it does not apply) go with it.
      const unused = await this.uploadFiles.prune(tx, versionId, slot, 'notApplicable' in content ? [] : content.diagrams.map((diagram) => diagram.id));
      return { before, row, content, unused };
    });
    await this.uploadFiles.purge(unused);
    await this.audit.recordChange(principal, 'sad.diagram.saved', 'sad-version', versionId, { before: { [slot]: before }, after: { [slot]: content } }, { slot });
    const { answers } = await this.answersOf(em, versionId);
    const { diagrams } = await this.diagramsOf(em, versionId);
    return { slot, rowVersion: row.version, content: withoutFacts(content, hidden), ...this.outcome(answers, loaded.trm.values, loaded.access.readable, diagrams) };
  }

  /** People and applications in the section's tables: each must exist, and is named from TechCockpit and TRM. */
  private async namedRefs(em: EntityManager, section: Section, answers: SectionAnswers): Promise<SectionAnswers> {
    const ids = { person: new Set<string>(), application: new Set<string>() };
    settleRefs(section, answers, (ref, kind) => (ids[kind].add(ref.id), ref));
    const names = {
      person: new Map((await em.find(User, { id: { $in: [...ids.person] } })).map((user) => [user.id, personName(user)])),
      // As diagram picks: TRM applications with a name.
      application: new Map((await em.find(TrmApplication, { id: { $in: [...ids.application] }, name: { $ne: null } })).map((app) => [app.id, app.name!])),
    };
    return settleRefs(section, answers, (ref, kind, where) => {
      const name = names[kind].get(ref.id);
      if (name === undefined) throw new UnprocessableEntityException(kind === 'person' ? `${where}: pick a person from the directory.` : `${where}: pick applications from TRM.`);
      return { id: ref.id, name };
    });
  }

  private async checkRetentionRows(em: EntityManager, answers: SectionAnswers): Promise<void> {
    const ids = tickedRetention(answers);
    if ((await em.count(SadRetentionStandard, { id: { $in: ids } })) !== ids.length) {
      throw new UnprocessableEntityException('A backup schedule row is not in the standard retention list.');
    }
  }

  /** The standard rows a backup schedule ticks, as the list has them now (retired ones too). */
  private async retentionNow(em: EntityManager, answers: SadAnswers): Promise<RetentionValues[]> {
    const ids = tickedRetention(answers[BACKUP_SECTION] ?? {});
    return ids.length === 0 ? [] : (await em.find(SadRetentionStandard, { id: { $in: ids } }, { orderBy: { position: 'asc', id: 'asc' } })).map(retentionValues);
  }

  /** What the version's backup schedule shows: the rows as submitted, or for a draft as the list has them now. */
  private async retentionOf(em: EntityManager, version: SadVersion, answers: SadAnswers, readable: Set<SadSectionKey>): Promise<RetentionValues[]> {
    if (!readable.has(BACKUP_SECTION)) return [];
    return version.status !== 'draft' && version.retentionSnapshot ? version.retentionSnapshot : this.retentionNow(em, answers);
  }

  async submit(principal: Principal, versionId: string) {
    const em = this.em.fork();
    const { version, trm, access } = await this.load(em, principal, versionId);
    if (access.editable.size === 0) throw new ForbiddenException('You cannot submit this SAD.');
    const context = { applicationId: trm.application.id, firstVersion: version.document.lastNumber === 0 };
    // The version and its approval change together, or neither does (a refused submission leaves the draft as it was).
    const { resubmitting, approval } = await em.transactional(async (tx) => {
      const locked = await tx.findOneOrFail(SadVersion, versionId, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      if (locked.status !== 'draft') throw new ConflictException('Only a draft can be submitted.');
      const instance = locked.approvalInstanceId ? await tx.findOne(ApprovalInstance, locked.approvalInstanceId) : null;
      const resubmitting = instance?.status === 'returned';
      const { answers } = await this.answersOf(tx, versionId);
      const { diagrams } = await this.diagramsOf(tx, versionId);
      const incomplete = evaluate(SAD_TEMPLATE, answers, trm.values, diagrams).sections.filter((section) => section.missing.length > 0);
      if (incomplete.length > 0) {
        const named = incomplete.map((s) => (access.readable.has(s.section) ? `${titleOf(s.section)} (${s.missing.length})` : titleOf(s.section)));
        throw new UnprocessableEntityException(`Answer every applicable question first: ${named.join(', ')}.`);
      }
      const missing = resubmitting ? null : await this.approvals.missingApproverStep({ workflowCode: SAD_WORKFLOW, context, scope: trm.scope, submittedBy: principal.user.id });
      if (missing?.onlySubmitter) {
        throw new UnprocessableEntityException(`No ${missing.step.toLowerCase()} other than you is assigned to this application, and you cannot approve your own SAD. Ask an administrator to assign one.`);
      }
      if (missing) throw new UnprocessableEntityException(`No ${missing.step.toLowerCase()} is assigned to this application, so it cannot be approved. Ask an administrator to assign one.`);
      const approval = resubmitting
        ? await this.approvals.resubmitIn(tx, principal, instance.id)
        : await this.approvals.submitIn(tx, {
            workflowCode: SAD_WORKFLOW,
            subjectType: SAD_WORKFLOW,
            subjectId: versionId,
            subjectTitle: `SAD: ${trm.application.name ?? trm.application.number ?? 'application'} (version ${version.document.lastNumber + 1})`,
            context,
            scope: trm.scope,
            submittedBy: principal.user.id,
          });
      // What approvers review, and what the approved version keeps.
      locked.trmSnapshot = trm.values as Record<string, unknown>;
      locked.retentionSnapshot = await this.retentionNow(tx, answers);
      locked.submittedBy = tx.getReference(User, principal.user.id);
      locked.submittedAt = new Date();
      locked.status = 'in_approval';
      locked.approvalInstanceId = approval.instanceId;
      locked.updatedBy = principal.user.id;
      return { resubmitting, approval };
    });
    await approval.afterCommit();
    await this.audit.recordChange(principal, resubmitting ? 'sad.version.resubmitted' : 'sad.version.submitted', 'sad-version', versionId, {
      before: { status: 'draft' },
      after: { status: 'in_approval' },
    });
    return { id: versionId, status: 'in_approval' as const, approvalInstanceId: approval.instanceId };
  }

  /**
   * Cancels a draft: by the person who started it (even after losing edit rights), or holders of "Cancel any SAD
   * draft" (even without reading its sections). A returned approval is withdrawn with it.
   */
  async cancelDraft(principal: Principal, versionId: string) {
    const em = this.em.fork();
    const version = await em.findOne(SadVersion, { id: versionId, status: { $ne: 'cancelled' } }, { populate: ['document'] });
    const trm = version ? await loadSadTrm(em, version.document.application.id) : null;
    if (!version || !trm) throw new NotFoundException('SAD version not found');
    if (version.startedBy.id !== principal.user.id && !principal.can('sad:draft:manage', trm.scope)) {
      // Readers are told why; anyone else does not learn the version exists.
      await this.load(em, principal, versionId);
      throw new ForbiddenException('Only the person who started the draft, or someone allowed to cancel any SAD draft, can cancel it.');
    }
    const { unused, approval } = await em.transactional(async (tx) => {
      const locked = await tx.findOneOrFail(SadVersion, versionId, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      if (locked.status !== 'draft') throw new ConflictException('Only a draft can be cancelled. Withdraw the approval in the Approval Centre first.');
      const instance = locked.approvalInstanceId ? await tx.findOne(ApprovalInstance, locked.approvalInstanceId) : null;
      let approval: ApprovalChange | null = null;
      if (instance?.status === 'returned') {
        if (instance.submittedBy.id !== principal.user.id && !principal.can('approvals:instance:manage', trm.scope)) {
          throw new ConflictException('The submitter must cancel the returned approval in the Approval Centre first.');
        }
        approval = await this.approvals.cancelIn(tx, principal, instance.id);
      }
      locked.status = 'cancelled';
      locked.cancelledAt = new Date();
      locked.updatedBy = principal.user.id;
      // A cancelled draft is never opened again: its files go (stored copies other versions use are kept).
      return { unused: await this.uploadFiles.dropAll(tx, versionId), approval };
    });
    await approval?.afterCommit();
    await this.uploadFiles.purge(unused);
    await this.audit.recordChange(principal, 'sad.draft.cancelled', 'sad-version', versionId, { before: { status: 'draft' }, after: { status: 'cancelled' } });
    return { id: versionId, status: 'cancelled' as const, approvalInstanceId: null };
  }

  // ----- Approval outcomes (called after the approval engine commits)

  async onApprovalStatus(event: ApprovalStatusEvent): Promise<void> {
    const em = this.em.fork();
    const changed = await em.transactional(async (tx) => {
      const version = await tx.findOne(SadVersion, event.subjectId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      // Only the version's own approval moves it (submit records the approval with the version).
      if (!version || version.status === 'cancelled' || version.approvalInstanceId !== event.instanceId) return null;
      const before = version.status;
      if (event.status === 'in_progress') {
        version.status = 'in_approval';
      } else if (event.status === 'returned') {
        version.status = 'draft';
      } else if (event.status === 'cancelled') {
        version.status = 'draft';
        version.approvalInstanceId = null;
      } else if (event.status === 'approved') {
        await this.makeCurrent(tx, version);
      }
      return before === version.status ? null : { before, after: version.status, number: col(version.number) };
    });
    if (changed) {
      await this.audit.recordChange(null, `sad.version.${event.status}`, 'sad-version', event.subjectId, { before: { status: changed.before }, after: { status: changed.after, number: changed.number } }, { approvalInstanceId: event.instanceId });
    }
  }

  /**
   * Versions whose approval moved on while updating them failed (the approval engine logs a failed status callback
   * and carries on): each gets its approval's status again. Returns how many were put right.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'sad-approval-sync' })
  async syncApprovals(): Promise<number> {
    const em = this.em.fork();
    const open = new Map((await em.find(SadVersion, { status: { $in: OPEN_STATUSES }, approvalInstanceId: { $ne: null } })).map((version) => [version.approvalInstanceId!, version.status]));
    const instances = await em.find(ApprovalInstance, { id: { $in: [...open.keys()] } });
    const behind = instances.filter((instance) => VERSION_STATUS_OF[instance.status] !== open.get(instance.id));
    for (const instance of behind) {
      this.logger.warn(`SAD version ${instance.subjectId} missed its approval's status "${instance.status}": applying it now`);
      await this.onApprovalStatus({ instanceId: instance.id, workflowCode: instance.workflowCode, subjectType: instance.subjectType, subjectId: instance.subjectId, status: instance.status });
    }
    return behind.length;
  }

  private async makeCurrent(em: EntityManager, version: SadVersion): Promise<void> {
    const document = await em.findOneOrFail(SadDocument, version.document.id, { lockMode: LockMode.PESSIMISTIC_WRITE });
    const previous = await em.findOne(SadVersion, { document, status: 'current' });
    if (previous) {
      previous.status = 'superseded';
      await em.flush();
    }
    document.lastNumber += 1;
    version.status = 'current';
    version.number = document.lastNumber;
    version.approvedAt = new Date();

    // The central API inventory lists the current version's APIs.
    await em.nativeDelete(SadApi, { application: document.application.id });
    const { answers } = await this.answersOf(em, version.id);
    // The TRM snapshot is taken at submit, so an approved version always has one.
    if (evaluate(SAD_TEMPLATE, answers, version.trmSnapshot as TrmValues).hidden.has('apis')) return;
    const envelope = answers['api-inventory']?.apis;
    const rows = envelope && 'value' in envelope ? (envelope.value as ApiRow[]) : [];
    const str = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null);
    rows.forEach((row, position) => {
      const cells = row.cells;
      em.create(SadApi, {
        application: document.application,
        sadVersion: version,
        position,
        // A submitted (complete) table has every required cell.
        name: cells.name as string,
        description: str(cells.description),
        apiOwner: col(cells.apiOwner as SadApi['apiOwner']),
        businessOwner: col(cells.businessOwner as SadApi['businessOwner']),
        productionUrl: str(cells.productionUrl),
        uatUrl: str(cells.uatUrl),
        devUrl: str(cells.devUrl),
        authMethod: str(cells.authMethod),
        hosting: str(cells.hosting),
        thirdParty: cells.thirdParty === 'yes',
        classification: str(cells.classification),
        data: col(cells.data as SadApi['data']),
        dependencies: col(cells.dependencies as SadApi['dependencies']),
        priority: str(cells.priority),
        justification: str(cells.justification),
      });
    });
  }

  // ----- Central API inventory

  async apis(principal: Principal, query: SadApiQuery) {
    const em = this.em.fork();
    const visible = await this.visibleApplications(em, principal, ['sad:api-inventory:read', 'sad:api-inventory:update']);
    const where: FilterQuery<SadApi> = {};
    if (visible) where.application = { $in: [...visible] };
    if (query.applicationId) where.application = visible && !visible.has(query.applicationId) ? { $in: [] } : query.applicationId;
    if (query.classification) where.classification = query.classification;
    if (query.priority) where.priority = query.priority;
    // An API is in each environment it has a URL for.
    if (query.environment) where[API_URL_OF[query.environment]] = { $ne: null };
    if (query.hosting) where.hosting = query.hosting;
    if (query.thirdParty) where.thirdParty = query.thirdParty === 'yes';
    if (query.q) {
      const pattern = likePattern(query.q);
      where.$or = [{ name: { $ilike: pattern } }, { description: { $ilike: pattern } }, ...Object.values(API_URL_OF).map((url) => ({ [url]: { $ilike: pattern } }))];
    }
    const [rows, total] = await em.findAndCount(SadApi, where, {
      ...offsetOf(query),
      populate: ['application'],
      orderBy: [{ application: { name: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
    });
    const portfolios = await em.find(TrmApplicationPortfolio, { application: { $in: rows.map((row) => row.application.id) } });
    const classes = await this.fieldClasses.classes(em);
    const personal = (applicationId: string) =>
      classes.viewer(principal, {
        scope: { applicationId, applicationIds: [applicationId], portfolioIds: portfolios.filter((p) => p.application.id === applicationId).map((p) => p.portfolio.id) },
      })(SAD_API_PEOPLE);
    return {
      items: rows.map((row) => {
        const names = personal(row.application.id);
        return {
          id: row.id,
          application: { id: row.application.id, name: col(row.application.name) },
          versionId: row.sadVersion.id,
          name: row.name,
          description: col(row.description),
          apiOwner: names ? (col(row.apiOwner)) : null,
          businessOwner: names ? (col(row.businessOwner)) : null,
          productionUrl: col(row.productionUrl),
          uatUrl: col(row.uatUrl),
          devUrl: col(row.devUrl),
          authMethod: col(row.authMethod),
          hosting: col(row.hosting),
          thirdParty: col(row.thirdParty),
          classification: col(row.classification),
          data: col(row.data),
          dependencies: col(row.dependencies),
          priority: col(row.priority),
          justification: col(row.justification),
          namesHidden: !names,
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
