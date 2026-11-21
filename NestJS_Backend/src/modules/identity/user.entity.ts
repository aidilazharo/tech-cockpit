import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';
import { Department } from './department.entity.js';

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const UserSchema = defineEntity({
  name: 'User',
  // "user" is a reserved word in PostgreSQL
  tableName: 'app_user',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    // Okta username (the SAML NameID), trimmed and lower-cased: the identity key across sign-ins
    username: p.string().length(320).unique(),
    // Contact data, not an identity key. Okta's email replaces it at sign-in when Okta sends one.
    email: p.string().length(320).index(),
    // True once Okta has sent the email: it can no longer be edited in TechCockpit
    emailFromOkta: p.boolean().default(false),
    firstName: p.string().length(100).default(''),
    lastName: p.string().length(100).default(''),
    status: p.enum(USER_STATUSES).default('active'),
    // Vendor (third-party) users, set by an administrator: their role decides what they see; never system administrators
    isExternal: p.boolean().default(false),
    department: () => p.manyToOne(Department).nullable(),
    lastLoginAt: p.datetime().nullable(),
  },
});

export class User extends UserSchema.class {}
UserSchema.setClass(User);
