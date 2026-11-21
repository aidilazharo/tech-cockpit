import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';
import { User } from '../identity/user.entity.js';
import { TrmApplication } from '../trm/trm.entities.js';
import type { SectionAnswers } from './domain/answers.js';
import { DIAGRAM_SLOTS, type DiagramContent } from './domain/diagrams.js';
import { SAD_SECTION_KEYS } from './domain/sections.js';
import { UPLOAD_TYPES } from './domain/uploads.js';

/**
 * draft: being edited. in_approval: submitted, read-only. current: the approved version in force.
 * superseded: an earlier approved version. cancelled: a draft that was dropped.
 */
export const SAD_VERSION_STATUSES = ['draft', 'in_approval', 'current', 'superseded', 'cancelled'] as const;
export type SadVersionStatus = (typeof SAD_VERSION_STATUSES)[number];
export const OPEN_STATUSES: SadVersionStatus[] = ['draft', 'in_approval'];

/** One living SAD per TRM application. */
export const SadDocumentSchema = defineEntity({
  name: 'SadDocument',
  tableName: 'sad_document',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    application: () => p.manyToOne(TrmApplication).unique().deleteRule('cascade'),
    /** Number of the last approved version (0 before the first approval) */
    lastNumber: p.integer().default(0),
  },
});
export class SadDocument extends SadDocumentSchema.class {}
SadDocumentSchema.setClass(SadDocument);

/** A standard retention row's values, as a backup schedule shows them. */
export interface RetentionValues {
  id: string;
  serviceType: string;
  dataType: string;
  yearly: string;
  monthly: string;
  weekly: string;
  daily: string;
  comment: string | null;
  active: boolean;
}

export const SadVersionSchema = defineEntity({
  name: 'SadVersion',
  tableName: 'sad_version',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    document: () => p.manyToOne(SadDocument).deleteRule('cascade').index(),
    status: p.enum(SAD_VERSION_STATUSES).index(),
    /** 1, 2, 3...: set when approved */
    number: p.integer().nullable(),
    templateVersion: p.integer(),
    /** TRM values taken when submitted: what approvers review and what the approved version keeps */
    trmSnapshot: p.json<Record<string, unknown>>().nullable(),
    /** The standard retention rows the backup schedule ticks, as they were when submitted (the list changes; the version does not) */
    retentionSnapshot: p.json<RetentionValues[]>().nullable(),
    startedBy: () => p.manyToOne(User),
    submittedBy: () => p.manyToOne(User).nullable(),
    submittedAt: p.datetime().nullable(),
    approvedAt: p.datetime().nullable(),
    cancelledAt: p.datetime().nullable(),
    approvalInstanceId: p.uuid().nullable(),
  },
});
export class SadVersion extends SadVersionSchema.class {}
SadVersionSchema.setClass(SadVersion);

/** One section's answers in one version. The row version is the section's optimistic lock. */
export const SadSectionSchema = defineEntity({
  name: 'SadSection',
  tableName: 'sad_section',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['sadVersion', 'section'] }],
  properties: {
    ...baseProperties(),
    sadVersion: () => p.manyToOne(SadVersion).deleteRule('cascade').index(),
    section: p.enum(SAD_SECTION_KEYS),
    answers: p.json<SectionAnswers>(),
  },
});
export class SadSection extends SadSectionSchema.class {}
SadSectionSchema.setClass(SadSection);

/** One diagram slot in one version (SAD part 2). The row version is the slot's optimistic lock. */
export const SadDiagramSchema = defineEntity({
  name: 'SadDiagram',
  tableName: 'sad_diagram',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['sadVersion', 'slot'] }],
  properties: {
    ...baseProperties(),
    sadVersion: () => p.manyToOne(SadVersion).deleteRule('cascade').index(),
    slot: p.enum(DIAGRAM_SLOTS),
    /** Not applicable with a reason, or the slot's diagrams */
    content: p.json<DiagramContent>(),
  },
});
export class SadDiagram extends SadDiagramSchema.class {}
SadDiagramSchema.setClass(SadDiagram);

/** The API inventory of each application's current version, kept as rows for the central list. */
export const SadApiSchema = defineEntity({
  name: 'SadApi',
  tableName: 'sad_api',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    application: () => p.manyToOne(TrmApplication).deleteRule('cascade').index(),
    sadVersion: () => p.manyToOne(SadVersion).deleteRule('cascade').index(),
    position: p.integer(),
    name: p.text(),
    description: p.text().nullable(),
    /** Personal: { id, name } picked, or { name } typed */
    apiOwner: p.json<{ id?: string; name: string }>().nullable(),
    /** Personal: { id, name } picked, or { name } typed */
    businessOwner: p.json<{ id?: string; name: string }>().nullable(),
    /** The API's URL in each environment it runs in (at least one) */
    productionUrl: p.text().nullable(),
    uatUrl: p.text().nullable(),
    devUrl: p.text().nullable(),
    authMethod: p.text().nullable(),
    hosting: p.text().nullable(),
    thirdParty: p.boolean().nullable(),
    classification: p.text().nullable().index(),
    /** Data connected to the API: each data object with its key attributes */
    data: p.json<{ object: string; attributes: string }[]>().nullable(),
    dependencies: p.json<{ items: { id: string; name: string }[]; other?: string }>().nullable(),
    priority: p.text().nullable().index(),
    justification: p.text().nullable(),
  },
});
export class SadApi extends SadApiSchema.class {}
SadApiSchema.setClass(SadApi);

/** AIA's standard backup retention rows (admin-maintained); SADs tick the ones that apply. */
/** The hosting names a new infrastructure diagram starts with (one row; the "Diagram defaults" screen). */
export const SadDiagramDefaultsSchema = defineEntity({
  name: 'SadDiagramDefaults',
  tableName: 'sad_diagram_defaults',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    subscription: p.string().length(100),
    /** Azure programmatic region names */
    primaryRegion: p.string().length(50),
    drRegion: p.string().length(50),
    primaryDc: p.string().length(100),
    drDc: p.string().length(100),
    officeNetwork: p.string().length(100),
  },
});
export class SadDiagramDefaults extends SadDiagramDefaultsSchema.class {}
SadDiagramDefaultsSchema.setClass(SadDiagramDefaults);

export const SadRetentionStandardSchema = defineEntity({
  name: 'SadRetentionStandard',
  tableName: 'sad_retention_standard',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    position: p.integer(),
    serviceType: p.string().length(200),
    dataType: p.string().length(200),
    yearly: p.string().length(50),
    monthly: p.string().length(50),
    weekly: p.string().length(50),
    daily: p.string().length(50),
    comment: p.text().nullable(),
    active: p.boolean().default(true),
  },
});
export class SadRetentionStandard extends SadRetentionStandardSchema.class {}
SadRetentionStandardSchema.setClass(SadRetentionStandard);

/** Defender for Storage's verdict on a stored file (deployed); files in the local folder are not scanned. */
export const SAD_FILE_SCANS = ['scanning', 'clean', 'malicious', 'failed', 'unscanned'] as const;
export type SadFileScan = (typeof SAD_FILE_SCANS)[number];

/**
 * A file uploaded under a diagram, stored once: a new draft refers to the same stored file through its own
 * SadUpload row. The row is deleted when no version uses the file; a malicious file's row stays (shown as blocked).
 */
export const SadFileSchema = defineEntity({
  name: 'SadFile',
  tableName: 'sad_file',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    storageKey: p.string().length(200).unique(),
    name: p.string().length(200),
    type: p.enum(UPLOAD_TYPES),
    size: p.integer(),
    sha256: p.string().length(64),
    scan: p.enum(SAD_FILE_SCANS).index(),
    uploadedBy: () => p.manyToOne(User),
    /** When its stored copy was deleted (a malicious file) */
    removedAt: p.datetime().nullable(),
  },
});
export class SadFile extends SadFileSchema.class {}
SadFileSchema.setClass(SadFile);

/** A file under one diagram of a slot in one version. */
export const SadUploadSchema = defineEntity({
  name: 'SadUpload',
  tableName: 'sad_upload',
  schema: WILDCARD_SCHEMA,
  indexes: [{ properties: ['sadVersion', 'slot', 'diagramId'] }],
  properties: {
    ...baseProperties(),
    sadVersion: () => p.manyToOne(SadVersion).deleteRule('cascade'),
    slot: p.enum(DIAGRAM_SLOTS),
    /** The diagram's id in the slot's content */
    diagramId: p.string().length(64),
    file: () => p.manyToOne(SadFile).index(),
  },
});
export class SadUpload extends SadUploadSchema.class {}
SadUploadSchema.setClass(SadUpload);
