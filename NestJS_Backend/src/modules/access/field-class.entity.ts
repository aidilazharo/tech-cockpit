import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';

export const FIELD_CLASSES = ['financial', 'contract', 'personal', 'internal'] as const;
export type FieldClass = (typeof FIELD_CLASSES)[number];

/** An administrator's classification of a field, replacing its default from code. */
export const FieldClassOverrideSchema = defineEntity({
  name: 'FieldClassOverride',
  tableName: 'field_class_override',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    /** e.g. trm.application.licenceCost */
    fieldKey: p.string().length(200).unique(),
    dataClass: p.enum(FIELD_CLASSES),
  },
});
export class FieldClassOverride extends FieldClassOverrideSchema.class {}
FieldClassOverrideSchema.setClass(FieldClassOverride);
