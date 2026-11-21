import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';

/** Days a refused sign-in is kept after its last attempt (personal data of someone who is not a user). */
export const REFUSED_SIGN_IN_RETENTION_DAYS = 90;

/**
 * Someone Okta signed in who has not been added in TechCockpit, one row per Okta username.
 * Lets administrators add them; removed when they are added, dismissed or after the retention period.
 */
export const RefusedSignInSchema = defineEntity({
  name: 'RefusedSignIn',
  tableName: 'refused_sign_in',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    username: p.string().length(320).unique(),
    /** As Okta sent them, if it did */
    email: p.string().length(320).nullable(),
    firstName: p.string().length(100).default(''),
    lastName: p.string().length(100).default(''),
    attempts: p.integer().default(1),
    firstAttemptAt: p.datetime(),
    lastAttemptAt: p.datetime().index(),
  },
});
export class RefusedSignIn extends RefusedSignInSchema.class {}
RefusedSignInSchema.setClass(RefusedSignIn);
