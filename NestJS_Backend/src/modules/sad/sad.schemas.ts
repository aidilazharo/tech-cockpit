import { z } from 'zod';
import { PageQuerySchema, pageOf } from '../../common/http/pagination.js';
import { INSTANCE_STATUSES } from '../approvals/domain/engine.js';
import { BoxSchema, DIAGRAM_SLOTS, DIAGRAM_VIEWS, INFRA_TABS, LineSchema, ZoneSchema } from './domain/diagrams.js';
import { SAD_HISTORY_ACTIONS } from './domain/history.js';
import { HostingFields, hostingRules } from './domain/infrastructure.js';
import { SAD_SECTION_KEYS } from './domain/sections.js';
import { COLUMN_TYPES, TRM_SOURCES } from './domain/template-types.js';
import { UPLOAD_TYPES } from './domain/uploads.js';
import { SAD_FILE_SCANS, SAD_VERSION_STATUSES } from './sad.entities.js';

export const SadSectionKeySchema = z.enum(SAD_SECTION_KEYS);
const PersonRef = z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'SadPersonRef' });
const iso = z.date();

// ----- Template

const OptionSchema = z.object({ value: z.string(), label: z.string(), description: z.string().optional() }).meta({ id: 'SadOption' });
const ConditionSchema = z
  .object({ question: z.string(), anyOf: z.array(z.string()).optional(), anyExcept: z.array(z.string()).optional() })
  .meta({ id: 'SadCondition', description: 'Shown only when the named question has (anyOf) / has something other than (anyExcept) these values' });
const WarningSchema = z
  .object({ text: z.string(), when: z.array(z.object({ question: z.string(), anyOf: z.array(z.string()).optional(), over: z.number().optional() })) })
  .meta({ id: 'SadWarning', description: "Advice shown with the question when every test holds: the named question's answer is one of anyOf, or a number over `over`" });
const base = {
  key: z.string(),
  label: z.string(),
  hint: z.string().optional(),
  showWhen: ConditionSchema.optional(),
  warning: WarningSchema.optional(),
  allowNotApplicable: z.literal(false).optional().describe('false: the question cannot be marked Not applicable'),
  personal: z.boolean().optional(),
};
const ColumnSchema = z
  .object({ key: z.string(), label: z.string(), type: z.enum(COLUMN_TYPES), options: z.array(OptionSchema).optional(), optional: z.boolean().optional(), personal: z.boolean().optional() })
  .meta({ id: 'SadTableColumn' });
const ItemSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('text'), ...base }),
    z.object({ type: z.literal('short'), ...base }),
    z.object({ type: z.literal('choice'), ...base, options: z.array(OptionSchema), other: z.boolean().optional() }),
    z.object({ type: z.literal('multi'), ...base, options: z.array(OptionSchema), other: z.boolean().optional() }),
    z.object({ type: z.literal('yesno'), ...base, detailsLabel: z.string().optional() }),
    z.object({ type: z.literal('number'), ...base, unit: z.string().optional() }),
    z.object({ type: z.literal('date'), ...base }),
    z.object({ type: z.literal('links'), ...base }),
    z.object({ type: z.literal('table'), ...base, columns: z.array(ColumnSchema), fixedRows: z.array(z.string()).optional(), addRows: z.boolean() }),
    z.object({
      type: z.literal('trm'),
      ...base,
      source: z.enum(TRM_SOURCES),
      fallback: z.union([z.object({ type: z.literal('choice'), options: z.array(OptionSchema) }), z.object({ type: z.literal('none') })]).optional(),
    }),
    z.object({ type: z.literal('retention'), ...base }),
    z.object({ type: z.literal('note'), key: z.string(), text: z.string() }),
  ])
  .meta({ id: 'SadTemplateItem' });
const DiagramRefSchema = z
  .object({ slot: z.enum(DIAGRAM_SLOTS), view: z.enum(DIAGRAM_VIEWS) })
  .meta({ id: 'SadDiagramRef', description: "A diagram slot shown in a group: drawn in the slot's owning section, a read-only or other view elsewhere" });
const GroupSchema = z
  .object({
    key: z.string(),
    title: z.string().optional(),
    intro: z.string().optional(),
    showWhen: ConditionSchema.optional(),
    diagrams: z.array(DiagramRefSchema).optional(),
    items: z.array(ItemSchema),
  })
  .meta({ id: 'SadTemplateGroup' });
export const SadTemplateSchema = z
  .object({
    version: z.number().int(),
    sections: z.array(
      z.object({
        key: SadSectionKeySchema,
        title: z.string(),
        intro: z.string().optional(),
        groups: z.array(GroupSchema),
        references: z.array(z.string()),
        retired: z
          .array(z.object({ key: z.string(), label: z.string(), type: z.enum(['text', 'yesno', 'number']), removedIn: z.number().int(), unit: z.string().optional() }))
          .optional()
          .describe('Questions later template versions removed: approved and superseded versions still show their answers, marked "No longer asked"'),
      }),
    ),
  })
  .meta({ id: 'SadTemplate' });

// ----- Answers

export const SadAnswerSchema = z
  .union([z.object({ notApplicable: z.literal(true), reason: z.string() }), z.object({ value: z.unknown() })])
  .meta({ id: 'SadAnswer', description: 'A value (shape depends on the question type), or "not applicable" with a reason' });
const AnswersSchema = z.record(z.string(), SadAnswerSchema);
const CompletionSchema = z
  .object({ section: SadSectionKeySchema, total: z.number().int(), answered: z.number().int(), missing: z.array(z.string()) })
  .meta({ id: 'SadSectionCompletion', description: 'Only for sections the caller can view' });

// ----- List and overview

export const SadListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['none', 'draft', 'in_approval', 'current']).optional(),
  authentication: z.enum(['local']).optional().describe('local: only applications flagged for local authentication whose section 5 you can read'),
}).strict();
export type SadListQuery = z.infer<typeof SadListQuerySchema>;

const OpenRef = z.object({ versionId: z.uuid(), status: z.enum(['draft', 'in_approval']) });
const LocalAuthenticationFlag = z
  .enum(['approved', 'draft'])
  .nullable()
  .describe("Flagged for local authentication by the current version's section 5 (approved), else the open draft's (draft); null when not flagged or you cannot read section 5");
const CurrentRef = z.object({ versionId: z.uuid(), number: z.number().int(), approvedAt: iso });
export const SadListItemSchema = z
  .object({ applicationId: z.uuid(), name: z.string().nullable(), number: z.string().nullable(), current: CurrentRef.nullable(), open: OpenRef.nullable(), localAuthentication: LocalAuthenticationFlag })
  .meta({ id: 'SadListItem' });
export const SadListSchema = pageOf(SadListItemSchema).meta({ id: 'SadListPage' });

const ApplicationRef = z.object({ id: z.uuid(), name: z.string().nullable(), number: z.string().nullable() }).meta({ id: 'SadApplicationRef' });
export const SadOverviewSchema = z
  .object({
    application: ApplicationRef,
    current: CurrentRef.nullable(),
    open: z
      .object({
        versionId: z.uuid(),
        status: z.enum(['draft', 'in_approval']),
        draftOf: z.number().int(),
        startedBy: PersonRef.nullable(),
        startedAt: iso,
        submittedAt: iso.nullable(),
        approvalInstanceId: z.uuid().nullable(),
        approvalStatus: z.enum(INSTANCE_STATUSES).nullable(),
      })
      .nullable(),
    history: z.array(z.object({ versionId: z.uuid(), number: z.number().int(), approvedAt: iso, status: z.enum(['current', 'superseded']) })),
    readable: z.array(SadSectionKeySchema),
    editable: z.array(SadSectionKeySchema),
    canStartDraft: z.boolean(),
    localAuthentication: LocalAuthenticationFlag,
  })
  .meta({ id: 'SadOverview' });

// ----- Versions

const SadRetentionValuesSchema = z
  .object({
    id: z.uuid(),
    serviceType: z.string(),
    dataType: z.string(),
    yearly: z.string(),
    monthly: z.string(),
    weekly: z.string(),
    daily: z.string(),
    comment: z.string().nullable(),
    active: z.boolean(),
  })
  .meta({ id: 'SadRetentionValues' });

const SadHistoryRowSchema = z
  .object({
    action: z.enum(SAD_HISTORY_ACTIONS),
    user: PersonRef.nullable().describe('Who did it; null for version_approved, and when you may not see names in this SAD'),
    step: z.string().nullable().describe('The approval step a decision, question or answer was at'),
    comment: z.string().nullable().describe("The decision's comment, the question or the answer"),
    at: iso,
  })
  .meta({ id: 'SadHistoryRow' });

export const SadVersionSchema = z
  .object({
    id: z.uuid(),
    application: ApplicationRef,
    status: z.enum(SAD_VERSION_STATUSES),
    number: z.number().int().nullable(),
    draftOf: z.number().int().nullable(),
    templateVersion: z.number().int(),
    startedBy: PersonRef.nullable(),
    startedAt: iso,
    submittedBy: PersonRef.nullable(),
    submittedAt: iso.nullable(),
    approvedAt: iso.nullable(),
    approvalInstanceId: z.uuid().nullable(),
    approvalStatus: z.enum(INSTANCE_STATUSES).nullable(),
    /** Seen as an approver of this version (all sections, read-only) */
    asApprover: z.boolean(),
    /** People's names are hidden from the caller (vendors, roles without personal-data access) */
    namesHidden: z.boolean(),
    trm: z.object({ values: z.partialRecord(z.enum(TRM_SOURCES), z.unknown()), restricted: z.array(z.enum(TRM_SOURCES)), live: z.boolean() }).nullable(),
    sections: z.array(z.object({ key: SadSectionKeySchema, readable: z.boolean(), editable: z.boolean(), rowVersion: z.number().int(), answers: AnswersSchema.nullable() })),
    completion: z.array(CompletionSchema),
    hidden: z.array(z.string()),
    canSubmit: z.boolean(),
    canCancel: z.boolean(),
    localAuthentication: z.boolean().nullable().describe('Section 5 says the application does its own authentication; null when you cannot read section 5'),
    retention: z.array(SadRetentionValuesSchema).describe("The standard retention rows the backup schedule ticks: as submitted, or for a draft as the list has them now (retired ones too); empty without the backup section"),
    history: z.array(SadHistoryRowSchema).describe("The template's Version Control rows, in date order: started, every approval's events (withdrawn ones too), approved"),
  })
  .meta({ id: 'SadVersion' });

export const SaveSadSectionSchema = z
  .object({ answers: z.record(z.string(), z.unknown()), version: z.number().int().min(0).describe('The section row version you edited (0 for a section never saved)') })
  .strict()
  .meta({ id: 'SaveSadSection' });
export type SaveSadSection = z.infer<typeof SaveSadSectionSchema>;

export const SavedSadSectionSchema = z
  .object({ section: SadSectionKeySchema, rowVersion: z.number().int(), answers: AnswersSchema, completion: z.array(CompletionSchema), hidden: z.array(z.string()) })
  .meta({ id: 'SavedSadSection' });

// ----- Diagrams (SAD part 2)

export const SadDiagramSlotSchema = z.enum(DIAGRAM_SLOTS);
const DiagramPageSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    tab: z.enum(INFRA_TABS).optional(),
    sizing: z.enum(['auto', 'manual']),
    zones: z.array(ZoneSchema.meta({ id: 'SadDiagramZone' })),
    boxes: z.array(BoxSchema.meta({ id: 'SadDiagramBox' })),
    lines: z.array(LineSchema.meta({ id: 'SadDiagramLine' })),
  })
  .meta({ id: 'SadDiagram' });
const SadHostingSchema = HostingFields.meta({
  id: 'SadHosting',
  description: 'The names of the infrastructure diagram\'s fixed zones: subscription, primary and DR Azure regions (programmatic names), data centres and office network',
});
export const SadDiagramContentSchema = z
  .union([
    z.object({ notApplicable: z.literal(true), reason: z.string() }),
    z.object({ diagrams: z.array(DiagramPageSchema), hosting: SadHostingSchema.optional().describe('Infrastructure diagram only: its hosting settings') }),
  ])
  .meta({ id: 'SadDiagramContent', description: "Not applicable with a reason, or the slot's diagrams" });
const SadDiagramViewSchema = z.enum(DIAGRAM_VIEWS);
export const SadDiagramsSchema = z
  .object({
    items: z.array(
      z.object({
        slot: SadDiagramSlotSchema,
        /** The section whose editors draw it */
        owner: SadSectionKeySchema,
        readableViews: z.array(SadDiagramViewSchema).describe("Views shown in sections you can read; other views' connection facts are left out of the content"),
        editableViews: z
          .array(SadDiagramViewSchema)
          .describe("Views whose part you may change on this draft: the drawing view everything but other views' facts, another view its own facts"),
        rowVersion: z.number().int(),
        content: SadDiagramContentSchema,
        hidden: z
          .array(
            z
              .object({
                diagramId: z.string(),
                takenIds: z.array(z.string()).describe('Ids of lines left out of the content: new items must not take them'),
                carriers: z
                  .array(z.object({ id: z.string(), view: SadDiagramViewSchema }))
                  .describe("Items in the content that carry lines or facts of a view you cannot read (removing them removes those too); never the facts themselves"),
              })
              .meta({ id: 'SadDiagramHidden' }),
          )
          .describe('For editors only: what each diagram holds that their sections do not show'),
      }),
    ),
    apis: z
      .array(z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'SadDiagramApi' }))
      .describe("The API inventory's APIs, by name only, for readers of the integration view: every API for its editors and readers of the API Inventory section, else only those linked"),
  })
  .meta({ id: 'SadDiagrams' });
export const SaveSadDiagramSchema = z
  .object({
    content: z.record(z.string(), z.unknown()).describe("Not applicable with a reason, or { diagrams } (see SadDiagramContent); checked against the slot's rules"),
    version: z.number().int().min(0).describe('The slot row version you edited (0 for a slot never saved)'),
    copyFromProduction: z
      .boolean()
      .optional()
      .describe("Infrastructure diagram: non-production is a copy of production (section 3's Copy from production); the API copies the integration connections too"),
  })
  .strict()
  .meta({ id: 'SaveSadDiagram' });
export type SaveSadDiagram = z.infer<typeof SaveSadDiagramSchema>;
const SadCallApplicationSchema = z
  .object({ id: z.uuid(), name: z.string().nullable(), number: z.string().nullable() })
  .meta({ id: 'SadCallApplication', description: 'A TRM application (name and APM number only)' });
export const SadApplicationCallsSchema = z
  .object({
    items: z.array(
      z
        .object({
          caller: SadCallApplicationSchema,
          callee: SadCallApplicationSchema,
          calls: z.string().nullable().describe('What it calls (null when not described, or restricted)'),
          does: z.string().nullable().describe('What it does (null when not described, or restricted)'),
          restricted: z.boolean().describe('True when the reader cannot read section 2 of the SAD it comes from'),
          twoWay: z.boolean(),
          source: z
            .object({ applicationId: z.uuid(), applicationName: z.string().nullable(), versionId: z.uuid(), number: z.number().int(), approvedAt: z.iso.datetime() })
            .describe('The approved SAD that describes the call'),
        })
        .meta({ id: 'SadApplicationCall' }),
    ),
  })
  .meta({ id: 'SadApplicationCalls', description: "Calls between an application and others, from every application's latest approved SAD (one row per SAD that says it)" });
export const SadServersSchema = z
  .object({ items: z.array(z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'SadServer' })) })
  .meta({ id: 'SadServers', description: "The application's TRM servers (through its services), by name" });
export const SadDiagramDefaultsSchema = HostingFields.extend({ version: z.number().int() }).meta({ id: 'SadDiagramDefaults' });
export const SaveSadDiagramDefaultsSchema = HostingFields.extend({ version: z.number().int().min(1).describe('The version you edited') })
  .strict()
  .superRefine(hostingRules)
  .meta({ id: 'SaveSadDiagramDefaults' });
export type SaveSadDiagramDefaults = z.infer<typeof SaveSadDiagramDefaultsSchema>;
export const SadBusinessApplicationQuerySchema = z.object({ q: z.string().trim().min(2).max(100).describe('Part of the name or APM number') });
export const SadBusinessApplicationsSchema = z
  .object({ items: z.array(z.object({ id: z.uuid(), number: z.string().nullable(), name: z.string() }).meta({ id: 'SadBusinessApplication' })) })
  .meta({ id: 'SadBusinessApplications' });
export const SavedSadDiagramSchema = z
  .object({ slot: SadDiagramSlotSchema, rowVersion: z.number().int(), content: SadDiagramContentSchema, completion: z.array(CompletionSchema), hidden: z.array(z.string()) })
  .meta({ id: 'SavedSadDiagram' });

export const SadVersionRefSchema = z.object({ id: z.uuid(), status: z.enum(SAD_VERSION_STATUSES), approvalInstanceId: z.uuid().nullable() }).meta({ id: 'SadVersionRef' });

// ----- API inventory (central list)

export const SadApiQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  applicationId: z.uuid().optional(),
  classification: z.string().max(50).optional(),
  priority: z.string().max(50).optional(),
  environment: z.enum(['production', 'uat', 'dev']).optional().describe('APIs with a URL in this environment'),
  hosting: z.string().max(50).optional(),
  thirdParty: z.enum(['yes', 'no']).optional(),
}).strict();
export type SadApiQuery = z.infer<typeof SadApiQuerySchema>;

/** An owner picked from TechCockpit users ({ id, name }) or typed ({ name }). */
const OwnerRef = z.object({ id: z.uuid().optional(), name: z.string() }).meta({ id: 'SadOwnerRef' });

export const SadApiItemSchema = z
  .object({
    id: z.uuid(),
    application: z.object({ id: z.uuid(), name: z.string().nullable() }),
    versionId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    apiOwner: OwnerRef.nullable(),
    businessOwner: OwnerRef.nullable(),
    productionUrl: z.string().nullable(),
    uatUrl: z.string().nullable(),
    devUrl: z.string().nullable(),
    authMethod: z.string().nullable(),
    hosting: z.string().nullable(),
    thirdParty: z.boolean().nullable(),
    classification: z.string().nullable(),
    data: z.array(z.object({ object: z.string(), attributes: z.string() })).nullable().describe('Data connected to the API: each data object with its key attributes'),
    dependencies: z.object({ items: z.array(z.object({ id: z.uuid(), name: z.string() })), other: z.string().optional() }).nullable(),
    priority: z.string().nullable(),
    justification: z.string().nullable(),
    namesHidden: z.boolean().describe("The owners are null because you may not see people's names in this SAD (not because they are not set)"),
  })
  .meta({ id: 'SadApi' });
export const SadApiPageSchema = pageOf(SadApiItemSchema).meta({ id: 'SadApiPage' });

// ----- Retention list

const retentionText = (max: number) => z.string().trim().min(1).max(max);
export const SadRetentionStandardSchema = SadRetentionValuesSchema.extend({ version: z.number().int(), position: z.number().int() }).meta({ id: 'SadRetentionStandard' });
export const SadRetentionListSchema = z.object({ items: z.array(SadRetentionStandardSchema) }).meta({ id: 'SadRetentionList' });
const retentionFields = {
  serviceType: retentionText(200),
  dataType: retentionText(200),
  yearly: retentionText(50),
  monthly: retentionText(50),
  weekly: retentionText(50),
  daily: retentionText(50),
  comment: z.string().trim().max(1000).nullable().optional(),
};
export const CreateSadRetentionSchema = z.object(retentionFields).strict().meta({ id: 'CreateSadRetentionStandard' });
export type CreateSadRetention = z.infer<typeof CreateSadRetentionSchema>;
export const UpdateSadRetentionSchema = z
  .object({
    serviceType: retentionFields.serviceType.optional(),
    dataType: retentionFields.dataType.optional(),
    yearly: retentionFields.yearly.optional(),
    monthly: retentionFields.monthly.optional(),
    weekly: retentionFields.weekly.optional(),
    daily: retentionFields.daily.optional(),
    comment: retentionFields.comment,
    active: z.boolean().optional(),
    position: z.number().int().min(1).optional(),
    version: z.number().int(),
  })
  .strict()
  .meta({ id: 'UpdateSadRetentionStandard' });
export type UpdateSadRetention = z.infer<typeof UpdateSadRetentionSchema>;

// ----- Files under diagrams

/** A diagram's id within its slot (as in the slot's content). */
export const SadDiagramIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Use letters, digits, - or _ (up to 64)');

export const SadUploadSchema = z
  .object({
    id: z.uuid(),
    slot: z.enum(DIAGRAM_SLOTS),
    diagramId: z.string(),
    name: z.string(),
    type: z.enum(UPLOAD_TYPES),
    size: z.number().int(),
    /** Defender for Storage's verdict (deployed); "unscanned" in the local folder. Only clean or unscanned files download. */
    scan: z.enum(SAD_FILE_SCANS),
    /** Null when the reader may not see people's names in this SAD */
    uploadedBy: PersonRef.nullable(),
    uploadedAt: z.iso.datetime(),
  })
  .meta({ id: 'SadUpload' });

export const SadUploadsSchema = z.object({ items: z.array(SadUploadSchema) }).meta({ id: 'SadUploads' });

