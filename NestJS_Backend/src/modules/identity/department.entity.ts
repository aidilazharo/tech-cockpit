import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';

export const DepartmentSchema = defineEntity({
  name: 'Department',
  tableName: 'department',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    code: p.string().length(50).unique(),
    name: p.string().length(200),
    active: p.boolean().default(true),
  },
});

export class Department extends DepartmentSchema.class {}
DepartmentSchema.setClass(Department);
