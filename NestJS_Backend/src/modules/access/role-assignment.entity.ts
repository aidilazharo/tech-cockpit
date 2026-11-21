import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';
import { User } from '../identity/user.entity.js';
import { SCOPE_TYPES } from './principal.js';
import { Role } from './role.entity.js';

/** A user holds a role within a scope for a period. Ending an assignment sets validTo. */
export const RoleAssignmentSchema = defineEntity({
  name: 'RoleAssignment',
  tableName: 'role_assignment',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    user: () => p.manyToOne(User).index(),
    role: () => p.manyToOne(Role).index(),
    scopeType: p.enum(SCOPE_TYPES),
    scopeId: p.uuid().nullable(),
    validFrom: p.datetime(),
    validTo: p.datetime().nullable(),
  },
});

export class RoleAssignment extends RoleAssignmentSchema.class {}
RoleAssignmentSchema.setClass(RoleAssignment);
