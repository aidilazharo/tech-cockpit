import { z } from 'zod'
import { AZURE_REGIONS, type AzureRegion } from './azure-regions'

// Shapes of the SAD API (NestJS_Backend/src/modules/sad/sad.schemas.ts), checked by contract.test.ts.

const dateTime = z.iso.datetime()
const name = z.string().nullable()

export const SAD_SECTION_KEYS = [
  'application-details',
  'solution-integration',
  'network',
  'resiliency',
  'security-design',
  'api-inventory',
  'data-protection',
  'security-iam',
  'data-architecture',
  'deployment',
  'environment',
  'logging',
  'backup',
] as const
export type SadSectionKey = (typeof SAD_SECTION_KEYS)[number]
export const SadSectionKeySchema = z.enum(SAD_SECTION_KEYS)

export const TRM_SOURCES = [
  'name',
  'number',
  'description',
  'capability',
  'portfolios',
  'displayName',
  'ownedBusinessUnit',
  'bcmCriticality',
  'rpoRto',
  'dataClassification',
  'businessOwner',
  'itApplicationOwner',
  'applicationManager',
  'applicationLead',
  'productManagers',
  'portfolioLeads',
  'environment',
] as const
export type TrmSource = (typeof TRM_SOURCES)[number]
/** person: picked ({ id, name }) or typed ({ name }); dataObjects: rows of data object and key attributes */
export const COLUMN_TYPES = ['text', 'choice', 'yesno', 'number', 'date', 'person', 'applications', 'dataObjects'] as const
export const VERSION_STATUSES = ['draft', 'in_approval', 'current', 'superseded', 'cancelled'] as const
export type VersionStatus = (typeof VERSION_STATUSES)[number]
export const APPROVAL_STATUSES = ['in_progress', 'returned', 'awaiting_info', 'approved', 'cancelled'] as const

// ----- Template

export const OptionSchema = z.object({ value: z.string(), label: z.string(), description: z.string().optional() })
export type Option = z.infer<typeof OptionSchema>
export const ConditionSchema = z.object({ question: z.string(), anyOf: z.array(z.string()).optional(), anyExcept: z.array(z.string()).optional() })
export type Condition = z.infer<typeof ConditionSchema>
export const ColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(COLUMN_TYPES),
  options: z.array(OptionSchema).optional(),
  optional: z.boolean().optional(),
  personal: z.boolean().optional(),
})
export type Column = z.infer<typeof ColumnSchema>
/** Advice shown with a question when every test holds: an answer among anyOf, or a number over `over`. */
const WarningSchema = z.object({ text: z.string(), when: z.array(z.object({ question: z.string(), anyOf: z.array(z.string()).optional(), over: z.number().optional() })) })
const base = {
  key: z.string(),
  label: z.string(),
  hint: z.string().optional(),
  showWhen: ConditionSchema.optional(),
  warning: WarningSchema.optional(),
  /** false: the question has no Not applicable option */
  allowNotApplicable: z.literal(false).optional(),
  personal: z.boolean().optional(),
}
export const ItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), ...base }),
  z.object({ type: z.literal('short'), ...base }),
  z.object({ type: z.literal('choice'), ...base, options: z.array(OptionSchema), other: z.boolean().optional() }),
  z.object({ type: z.literal('multi'), ...base, options: z.array(OptionSchema), other: z.boolean().optional() }),
  z.object({ type: z.literal('yesno'), ...base, detailsLabel: z.string().optional() }),
  z.object({ type: z.literal('number'), ...base, unit: z.string().optional() }),
  z.object({ type: z.literal('date'), ...base }),
  z.object({ type: z.literal('links'), ...base }),
  z.object({
    type: z.literal('table'),
    ...base,
    columns: z.array(ColumnSchema),
    fixedRows: z.array(z.string()).optional(),
    addRows: z.boolean(),
    /** Groups of columns of which each row needs at least one (e.g. a URL for one environment) */
    oneOf: z.array(z.array(z.string())).optional(),
  }),
  z.object({
    type: z.literal('trm'),
    ...base,
    source: z.enum(TRM_SOURCES),
    fallback: z.union([z.object({ type: z.literal('choice'), options: z.array(OptionSchema) }), z.object({ type: z.literal('none') })]).optional(),
  }),
  z.object({ type: z.literal('retention'), ...base }),
  z.object({ type: z.literal('note'), key: z.string(), text: z.string() }),
])
export type Item = z.infer<typeof ItemSchema>
export type Question = Exclude<Item, { type: 'note' }>
export type QuestionOf<T extends Question['type']> = Extract<Question, { type: T }>
// ----- Diagrams (SAD part 2)

export const DIAGRAM_SLOTS = ['solution', 'infrastructure', 'ci-cd', 'monitoring'] as const
export type DiagramSlot = (typeof DIAGRAM_SLOTS)[number]
export const DIAGRAM_VIEWS = ['solution', 'data-flow', 'infrastructure', 'integration', 'process', 'monitoring'] as const
export type DiagramView = (typeof DIAGRAM_VIEWS)[number]
export const INFRA_TABS = ['production', 'non-production'] as const
export const SIDES = ['t', 'r', 'b', 'l'] as const
/** Solution diagram blocks: actors, parts of this application, other business applications and external parties. */
export const BLOCK_TYPES = ['actor', 'part', 'business', 'external'] as const
export type BlockType = (typeof BLOCK_TYPES)[number]
/** The AIA data classification list. */
export const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'highly-confidential'] as const
/** Infrastructure diagram: the hosting settings that name its fixed zones, and the kinds of zone and box. */
export const HOSTING_FIELDS = ['subscription', 'primaryRegion', 'drRegion', 'primaryDc', 'drDc', 'officeNetwork'] as const
export type HostingField = (typeof HOSTING_FIELDS)[number]
/** Integration connections: TLS (1.1 and 1.0 are flagged non-compliant), pattern and flow type. */
export const TLS_VERSIONS = ['1.3', '1.2', '1.1', '1.0', 'none'] as const
export const PATTERNS = ['api', 'web-ui', 'file', 'event', 'database'] as const
export const FLOW_TYPES = ['service', 'end-user', 'it-admin'] as const
export const INFRA_ZONE_KINDS = ['subscription', 'region', 'vnet', 'subnet', 'data-centre', 'office', 'internet', 'azure-global', 'third-party'] as const
export type InfraZoneKind = (typeof INFRA_ZONE_KINDS)[number]
/** "azure": an Azure service, named by its icon; the generic service shapes before it stay valid. */
export const INFRA_BOX_TYPES = ['server', 'person', 'firewall', 'wifi', 'vpn', 'azure', 'web', 'api', 'worker', 'database', 'queue', 'storage', 'external', 'business'] as const
export type InfraBoxType = (typeof INFRA_BOX_TYPES)[number]
const RegionSchema = z.enum(AZURE_REGIONS.map((region) => region.code) as [AzureRegion, ...AzureRegion[]])
export const HostingSchema = z.object({ subscription: z.string(), primaryRegion: RegionSchema, drRegion: RegionSchema, primaryDc: z.string(), drDc: z.string(), officeNetwork: z.string() })
export type Hosting = z.infer<typeof HostingSchema>
export type Side = (typeof SIDES)[number]

export const DiagramRefSchema = z.object({ slot: z.enum(DIAGRAM_SLOTS), view: z.enum(DIAGRAM_VIEWS) })
export type DiagramRef = z.infer<typeof DiagramRefSchema>
export const ZoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string().optional(),
  /** Infrastructure: the hosting setting that names this fixed zone, and whether this diagram changed its name */
  hosting: z.enum(HOSTING_FIELDS).optional(),
  ownName: z.literal(true).optional(),
  parentId: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type Zone = z.infer<typeof ZoneSchema>
export const BoxSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string(),
  /** A business application picked from TRM, with the APM number it was picked with (its name is the label) */
  application: z.object({ id: z.uuid(), number: z.string().nullable() }).optional(),
  /** Infrastructure: a server picked from the application's TRM servers (its name, as picked, is the label) */
  server: z.object({ id: z.uuid() }).optional(),
  /** An Azure icon from Microsoft's set */
  icon: z.string().optional(),
  /** CI and CD flows: who approves an approval step */
  approver: z.string().optional(),
  parentId: z.string().optional(),
  x: z.number(),
  y: z.number(),
})
export type Box = z.infer<typeof BoxSchema>
export const LineSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  fromSide: z.enum(SIDES).optional(),
  toSide: z.enum(SIDES).optional(),
  label: z.string().optional(),
  dashed: z.boolean().optional(),
  twoWay: z.boolean().optional(),
  // Solution diagram: what the connection calls and does (section 2), and its data flow facts (section 9).
  calls: z.string().optional(),
  does: z.string().optional(),
  data: z.string().optional(),
  classification: z.enum(DATA_CLASSIFICATIONS).optional(),
  frequency: z.string().optional(),
  // Infrastructure diagram: an integration connection (section 2) and its network facts; other lines are infrastructure lines (section 3).
  layer: z.literal('integration').optional(),
  protocol: z.string().optional(),
  port: z.number().int().optional(),
  tls: z.enum(TLS_VERSIONS).optional(),
  protection: z.string().optional(),
  pattern: z.enum(PATTERNS).optional(),
  api: z.object({ id: z.uuid() }).optional(),
  authentication: z.string().optional(),
  purpose: z.string().optional(),
  flow: z.enum(FLOW_TYPES).optional(),
})
export type Line = z.infer<typeof LineSchema>
export const DiagramSchema = z.object({
  id: z.string(),
  title: z.string(),
  tab: z.enum(INFRA_TABS).optional(),
  sizing: z.enum(['auto', 'manual']),
  zones: z.array(ZoneSchema),
  boxes: z.array(BoxSchema),
  lines: z.array(LineSchema),
})
/** A diagram; `taken` is the editor's own (never sent): ids new items must not take (see diagrams/editing.ts). */
export type Diagram = z.infer<typeof DiagramSchema> & { taken?: string[] }
export const DiagramContentSchema = z.union([z.object({ notApplicable: z.literal(true), reason: z.string() }), z.object({ diagrams: z.array(DiagramSchema), hosting: HostingSchema.optional() })])
export type DiagramContent = z.infer<typeof DiagramContentSchema>

export const GroupSchema = z.object({
  key: z.string(),
  title: z.string().optional(),
  intro: z.string().optional(),
  showWhen: ConditionSchema.optional(),
  diagrams: z.array(DiagramRefSchema).optional(),
  items: z.array(ItemSchema),
})
export type Group = z.infer<typeof GroupSchema>
export const TemplateSectionSchema = z.object({
  key: SadSectionKeySchema,
  title: z.string(),
  intro: z.string().optional(),
  groups: z.array(GroupSchema),
  references: z.array(z.string()),
  /** Questions later templates removed: approved and superseded versions still show their answers */
  retired: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(['text', 'yesno', 'number']), removedIn: z.number().int(), unit: z.string().optional() })).optional(),
})
export type TemplateSection = z.infer<typeof TemplateSectionSchema>
export const TemplateSchema = z.object({ version: z.number().int(), sections: z.array(TemplateSectionSchema) })
export type Template = z.infer<typeof TemplateSchema>

// ----- Answers

export const AnswerSchema = z.union([z.object({ notApplicable: z.literal(true), reason: z.string() }), z.object({ value: z.unknown() })])
export type Answer = z.infer<typeof AnswerSchema>
export type SectionAnswers = Record<string, Answer>
const AnswersSchema = z.record(z.string(), AnswerSchema)
export const CompletionSchema = z.object({ section: SadSectionKeySchema, total: z.number().int(), answered: z.number().int(), missing: z.array(z.string()) })
export type Completion = z.infer<typeof CompletionSchema>

// ----- List and overview

const CurrentRefSchema = z.object({ versionId: z.uuid(), number: z.number().int(), approvedAt: dateTime })
const OpenRefSchema = z.object({ versionId: z.uuid(), status: z.enum(['draft', 'in_approval']) })
/** Flagged for local authentication: by the current version's section 5 (approved), else the open draft's (draft); null for readers who cannot read section 5. */
const LocalAuthenticationSchema = z.enum(['approved', 'draft']).nullable()
export const ListItemSchema = z.object({ applicationId: z.uuid(), name, number: name, current: CurrentRefSchema.nullable(), open: OpenRefSchema.nullable(), localAuthentication: LocalAuthenticationSchema })
export type ListItem = z.infer<typeof ListItemSchema>
export const ListPageSchema = z.object({ items: z.array(ListItemSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() })

export const PersonRefSchema = z.object({ id: z.uuid(), name: z.string() })
export type PersonRef = z.infer<typeof PersonRefSchema>
export const ApplicationRefSchema = z.object({ id: z.uuid(), name, number: name })

export const OverviewSchema = z.object({
  application: ApplicationRefSchema,
  current: CurrentRefSchema.nullable(),
  open: z
    .object({
      versionId: z.uuid(),
      status: z.enum(['draft', 'in_approval']),
      draftOf: z.number().int(),
      startedBy: PersonRefSchema.nullable(),
      startedAt: dateTime,
      submittedAt: dateTime.nullable(),
      approvalInstanceId: z.uuid().nullable(),
      approvalStatus: z.enum(APPROVAL_STATUSES).nullable(),
    })
    .nullable(),
  history: z.array(z.object({ versionId: z.uuid(), number: z.number().int(), approvedAt: dateTime, status: z.enum(['current', 'superseded']) })),
  readable: z.array(SadSectionKeySchema),
  editable: z.array(SadSectionKeySchema),
  canStartDraft: z.boolean(),
  localAuthentication: LocalAuthenticationSchema,
})
export type Overview = z.infer<typeof OverviewSchema>

// ----- Versions

/** A standard retention row's values, as a backup schedule shows them. */
const RetentionValuesSchema = z.object({
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
export type RetentionValues = z.infer<typeof RetentionValuesSchema>

export const HISTORY_ACTIONS = ['started', 'submitted', 'resubmitted', 'withdrawn', 'info_requested', 'answered', 'approved', 'returned', 'version_approved'] as const
export type HistoryAction = (typeof HISTORY_ACTIONS)[number]
const HistoryRowSchema = z.object({ action: z.enum(HISTORY_ACTIONS), user: PersonRefSchema.nullable(), step: z.string().nullable(), comment: z.string().nullable(), at: dateTime })
export type HistoryRow = z.infer<typeof HistoryRowSchema>

export const VersionSchema = z.object({
  id: z.uuid(),
  application: ApplicationRefSchema,
  status: z.enum(VERSION_STATUSES),
  number: z.number().int().nullable(),
  draftOf: z.number().int().nullable(),
  templateVersion: z.number().int(),
  startedBy: PersonRefSchema.nullable(),
  startedAt: dateTime,
  submittedBy: PersonRefSchema.nullable(),
  submittedAt: dateTime.nullable(),
  approvedAt: dateTime.nullable(),
  approvalInstanceId: z.uuid().nullable(),
  approvalStatus: z.enum(APPROVAL_STATUSES).nullable(),
  asApprover: z.boolean(),
  namesHidden: z.boolean(),
  trm: z.object({ values: z.partialRecord(z.enum(TRM_SOURCES), z.unknown()), restricted: z.array(z.enum(TRM_SOURCES)), live: z.boolean() }).nullable(),
  sections: z.array(z.object({ key: SadSectionKeySchema, readable: z.boolean(), editable: z.boolean(), rowVersion: z.number().int(), answers: AnswersSchema.nullable() })),
  completion: z.array(CompletionSchema),
  hidden: z.array(z.string()),
  canSubmit: z.boolean(),
  canCancel: z.boolean(),
  /** Section 5 says the application does its own authentication; null for readers who cannot read section 5 */
  localAuthentication: z.boolean().nullable(),
  retention: z.array(RetentionValuesSchema),
  history: z.array(HistoryRowSchema),
})
export type Version = z.infer<typeof VersionSchema>
export type TrmData = NonNullable<Version['trm']>

export const SaveSectionSchema = z.object({ answers: z.record(z.string(), z.unknown()), version: z.number().int().min(0) })
export const SavedSectionSchema = z.object({
  section: SadSectionKeySchema,
  rowVersion: z.number().int(),
  answers: AnswersSchema,
  completion: z.array(CompletionSchema),
  hidden: z.array(z.string()),
})
export type SavedSection = z.infer<typeof SavedSectionSchema>
export const DiagramApiSchema = z.object({ id: z.uuid(), name: z.string() })
export type DiagramApi = z.infer<typeof DiagramApiSchema>
export const DiagramsSchema = z.object({
  items: z.array(
    z.object({
      slot: z.enum(DIAGRAM_SLOTS),
      owner: SadSectionKeySchema,
      /** Views shown in sections the reader can read; other views' connection facts are left out */
      readableViews: z.array(z.enum(DIAGRAM_VIEWS)),
      /** Views whose part the reader may change on this draft */
      editableViews: z.array(z.enum(DIAGRAM_VIEWS)),
      rowVersion: z.number().int(),
      content: DiagramContentSchema,
      /** For editors: per diagram, the ids of lines they cannot see, and the items carrying lines or facts of views they cannot read */
      hidden: z.array(
        z.object({
          diagramId: z.string(),
          takenIds: z.array(z.string()),
          carriers: z.array(z.object({ id: z.string(), view: z.enum(DIAGRAM_VIEWS) })),
        }),
      ),
    }),
  ),
  /** The API inventory's APIs, by name only, for readers of the integration view */
  apis: z.array(DiagramApiSchema),
})
export type DiagramSlotData = z.infer<typeof DiagramsSchema>['items'][number]
export const SaveDiagramSchema = z.object({ content: z.record(z.string(), z.unknown()), version: z.number().int().min(0), copyFromProduction: z.boolean().optional() })
export const SavedDiagramSchema = z.object({
  slot: z.enum(DIAGRAM_SLOTS),
  rowVersion: z.number().int(),
  content: DiagramContentSchema,
  completion: z.array(CompletionSchema),
  hidden: z.array(z.string()),
})
export const ServerSchema = z.object({ id: z.uuid(), name: z.string() })
export type Server = z.infer<typeof ServerSchema>
export const ServersSchema = z.object({ items: z.array(ServerSchema) })
export const DiagramDefaultsSchema = HostingSchema.extend({ version: z.number().int() })
export type DiagramDefaults = z.infer<typeof DiagramDefaultsSchema>
export const SaveDiagramDefaultsSchema = HostingSchema.extend({ version: z.number().int().min(1) })
export const CallApplicationSchema = z.object({ id: z.uuid(), name: z.string().nullable(), number: z.string().nullable() })
export type CallApplication = z.infer<typeof CallApplicationSchema>
export const ApplicationCallSchema = z.object({
  caller: CallApplicationSchema,
  callee: CallApplicationSchema,
  calls: z.string().nullable(),
  does: z.string().nullable(),
  /** The reader cannot read section 2 of the SAD it comes from */
  restricted: z.boolean(),
  twoWay: z.boolean(),
  source: z.object({ applicationId: z.uuid(), applicationName: z.string().nullable(), versionId: z.uuid(), number: z.number().int(), approvedAt: z.iso.datetime() }),
})
export type ApplicationCall = z.infer<typeof ApplicationCallSchema>
export const ApplicationCallsSchema = z.object({ items: z.array(ApplicationCallSchema) })
export const BusinessApplicationSchema = z.object({ id: z.uuid(), number: z.string().nullable(), name: z.string() })
export type BusinessApplication = z.infer<typeof BusinessApplicationSchema>
export const BusinessApplicationsSchema = z.object({ items: z.array(BusinessApplicationSchema) })
export const VersionRefSchema = z.object({ id: z.uuid(), status: z.enum(VERSION_STATUSES), approvalInstanceId: z.uuid().nullable() })

// ----- API inventory

/** An owner picked from TechCockpit users ({ id, name }) or typed ({ name }). */
const OwnerRefSchema = z.object({ id: z.uuid().optional(), name: z.string() })
/** A data object connected to an API, with its key attributes. */
export const DataObjectSchema = z.object({ object: z.string(), attributes: z.string() })
export type DataObject = z.infer<typeof DataObjectSchema>

export const ApiSchema = z.object({
  id: z.uuid(),
  application: z.object({ id: z.uuid(), name }),
  versionId: z.uuid(),
  name: z.string(),
  description: name,
  apiOwner: OwnerRefSchema.nullable(),
  businessOwner: OwnerRefSchema.nullable(),
  productionUrl: name,
  uatUrl: name,
  devUrl: name,
  authMethod: name,
  hosting: name,
  thirdParty: z.boolean().nullable(),
  classification: name,
  data: z.array(DataObjectSchema).nullable(),
  dependencies: z.object({ items: z.array(z.object({ id: z.uuid(), name: z.string() })), other: z.string().optional() }).nullable(),
  priority: name,
  justification: name,
  /** The owners are null because the reader may not see names (not because they are not set) */
  namesHidden: z.boolean(),
})
export type Api = z.infer<typeof ApiSchema>
export const ApiPageSchema = z.object({ items: z.array(ApiSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() })

// ----- Retention list

export const RetentionStandardSchema = RetentionValuesSchema.extend({ version: z.number().int(), position: z.number().int() })
export type RetentionStandard = z.infer<typeof RetentionStandardSchema>
export const RetentionListSchema = z.object({ items: z.array(RetentionStandardSchema) })
export const CreateRetentionSchema = z.object({
  serviceType: z.string(),
  dataType: z.string(),
  yearly: z.string(),
  monthly: z.string(),
  weekly: z.string(),
  daily: z.string(),
  comment: z.string().nullable().optional(),
})
export type CreateRetention = z.infer<typeof CreateRetentionSchema>
export const UpdateRetentionSchema = CreateRetentionSchema.partial().extend({ active: z.boolean().optional(), position: z.number().int().optional(), version: z.number().int() })
export type UpdateRetention = z.infer<typeof UpdateRetentionSchema>

// ----- Files under diagrams

export const UPLOAD_TYPES = ['docx', 'xlsx', 'pptx', 'vsdx', 'pdf', 'png', 'jpg', 'jpeg', 'drawio'] as const
export const UPLOAD_SCANS = ['scanning', 'clean', 'malicious', 'failed', 'unscanned'] as const
export const UploadSchema = z.object({
  id: z.uuid(),
  slot: z.enum(DIAGRAM_SLOTS),
  diagramId: z.string(),
  name: z.string(),
  type: z.enum(UPLOAD_TYPES),
  size: z.number().int(),
  /** Defender's verdict (deployed); "unscanned" locally. Only clean or unscanned files download. */
  scan: z.enum(UPLOAD_SCANS),
  /** Null when the reader may not see people's names in this SAD */
  uploadedBy: PersonRefSchema.nullable(),
  uploadedAt: z.iso.datetime(),
})
export type Upload = z.infer<typeof UploadSchema>
export const UploadsSchema = z.object({ items: z.array(UploadSchema) })

