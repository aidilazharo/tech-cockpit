import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';
import type { DataAccess } from './principal.js';

export const RoleSchema = defineEntity({
  name: 'Role',
  tableName: 'role',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    code: p.string().length(50).unique(),
    name: p.string().length(100),
    description: p.string().length(500).nullable(),
    /** Seeded roles: cannot be deleted. */
    isSystem: p.boolean().default(false),
    /** Holds every permission in the catalogue; only one role has this. */
    isSystemAdmin: p.boolean().default(false),
    /** Permission codes from the catalogue. */
    permissions: p.array(),
    /** Visibility of classified data, per data class. */
    dataAccess: p.json<DataAccess>(),
    /** Holders can act for staff: be out-of-office delegates and roadmap owners. */
    canActForStaff: p.boolean().default(false),
  },
});

export class Role extends RoleSchema.class {}
RoleSchema.setClass(Role);
