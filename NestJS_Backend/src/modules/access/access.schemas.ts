import { z } from 'zod';
import { PageQuerySchema, pageOf } from '../../common/http/pagination.js';
import { USER_STATUSES } from '../identity/user.entity.js';
import { FIELD_CLASSES } from './field-class.entity.js';
import { isPermissionCode } from './permission-catalogue.js';
import { DATA_ACCESS_LEVELS, SCOPE_TYPES } from './principal.js';

const level = z.enum(DATA_ACCESS_LEVELS).default('none');
export const DataAccessSchema = z
  .object({ financial: level, contract: level, personal: level })
  .strict()
  .meta({ id: 'DataAccess', description: 'Visibility of classified data: none | own | scope | all' });

const permissionCode = z.string().refine(isPermissionCode, { message: 'Unknown permission code' });
const roleCode = z.string().regex(/^[a-z][a-z0-9-]{1,49}$/, 'Lowercase kebab-case, 2-50 characters');
const version = z.number().int().min(1);

// ----- Roles ---------------------------------------------------------------
export const CreateRoleSchema = z
  .object({
    code: roleCode,
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    permissions: z.array(permissionCode).max(200),
    dataAccess: DataAccessSchema,
    canActForStaff: z.boolean().default(false).describe('Holders can be out-of-office delegates and roadmap owners'),
  })
  .strict()
  .meta({ id: 'CreateRole' });
export type CreateRole = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    permissions: z.array(permissionCode).max(200).optional(),
    dataAccess: DataAccessSchema.optional(),
    canActForStaff: z.boolean().optional(),
    version,
  })
  .strict()
  .meta({ id: 'UpdateRole' });
export type UpdateRole = z.infer<typeof UpdateRoleSchema>;

export const RoleSchemaOut = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    isSystemAdmin: z.boolean(),
    permissions: z.array(z.string()),
    dataAccess: DataAccessSchema,
    canActForStaff: z.boolean().describe('Holders can be out-of-office delegates and roadmap owners'),
    version: z.number().int(),
  })
  .meta({ id: 'Role' });
export const RoleListSchema = z.object({ items: z.array(RoleSchemaOut) });

export const PermissionListSchema = z.object({
  items: z.array(z.object({ code: z.string(), description: z.string() })),
});

// ----- Users ---------------------------------------------------------------
const email = z
  .email()
  .max(320)
  .transform((value) => value.trim().toLowerCase());

/** Okta username (login): no spaces, matched ignoring case, so stored lower-cased. */
const username = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .regex(/^\S+$/, 'An Okta username has no spaces')
  .transform((value) => value.toLowerCase());
const personNamePart = z.string().trim().max(100);

export const CreateUserSchema = z
  .object({
    username: username.describe('Okta username (the SAML NameID); unique, ignoring case'),
    email: email.describe("Replaced by Okta's email at sign-in when Okta sends one"),
    firstName: personNamePart.optional(),
    lastName: personNamePart.optional(),
    isExternal: z.boolean().describe('Vendor (third-party) user'),
    departmentId: z.uuid().nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateUser', description: 'Adds a person so they can sign in with Okta. Only added people can sign in.' });
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    username: username.optional(),
    email: email.optional().describe('Refused (422) once Okta has sent the email'),
    firstName: personNamePart.optional(),
    lastName: personNamePart.optional(),
    isExternal: z.boolean().optional().describe('Refused (422) while the user holds the system administrator role'),
    status: z.enum(USER_STATUSES).optional(),
    departmentId: z.uuid().nullable().optional(),
    version,
  })
  .strict()
  .meta({ id: 'UpdateUser' });
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const UserSchemaOut = z
  .object({
    id: z.uuid(),
    username: z.string().describe('Okta username'),
    email: z.string(),
    emailFromOkta: z.boolean().describe('The email came from Okta and cannot be edited'),
    firstName: z.string(),
    lastName: z.string(),
    status: z.enum(USER_STATUSES),
    isExternal: z.boolean().describe('Vendor (third-party) user'),
    departmentId: z.uuid().nullable(),
    lastLoginAt: z.date().nullable(),
    version: z.number().int(),
  })
  .meta({ id: 'User' });
export const UserPageSchema = pageOf(UserSchemaOut);
export const UserQuerySchema = PageQuerySchema.extend({ q: z.string().trim().max(100).optional() });
export type UserQuery = z.infer<typeof UserQuerySchema>;

// ----- Role assignments ----------------------------------------------------
export const CreateAssignmentSchema = z
  .object({
    userId: z.uuid(),
    roleCode,
    scopeType: z.enum(SCOPE_TYPES),
    scopeId: z.uuid().nullable().optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scopeType === 'global' && value.scopeId) {
      ctx.addIssue({ code: 'custom', path: ['scopeId'], message: 'Global assignments have no scope id' });
    }
    if (value.scopeType !== 'global' && !value.scopeId) {
      ctx.addIssue({ code: 'custom', path: ['scopeId'], message: 'A scope id is required for this scope type' });
    }
    if (value.validFrom && value.validTo && value.validTo <= value.validFrom) {
      ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'Must be after validFrom' });
    }
  })
  .meta({ id: 'CreateRoleAssignment' });
export type CreateAssignment = z.infer<typeof CreateAssignmentSchema>;

export const AssignmentSchemaOut = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    roleCode: z.string(),
    roleName: z.string(),
    scopeType: z.enum(SCOPE_TYPES),
    scopeId: z.uuid().nullable(),
    validFrom: z.date(),
    validTo: z.date().nullable(),
    active: z.boolean(),
  })
  .meta({ id: 'RoleAssignment' });
export const AssignmentListSchema = z.object({ items: z.array(AssignmentSchemaOut) });

// ----- Departments ---------------------------------------------------------
export const CreateDepartmentSchema = z
  .object({
    code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9-]{0,49}$/, 'Uppercase letters, digits and hyphens'),
    name: z.string().trim().min(1).max(200),
  })
  .strict()
  .meta({ id: 'CreateDepartment' });
export const UpdateDepartmentSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    active: z.boolean().optional().describe('Inactive departments cannot be chosen for new users or role scopes'),
    version,
  })
  .strict()
  .meta({ id: 'UpdateDepartment', description: 'The code cannot be changed.' });
export type UpdateDepartment = z.infer<typeof UpdateDepartmentSchema>;

export const DepartmentSchemaOut = z
  .object({ id: z.uuid(), code: z.string(), name: z.string(), active: z.boolean(), version: z.number().int() })
  .meta({ id: 'Department' });
export const DepartmentListSchema = z.object({ items: z.array(DepartmentSchemaOut) });

// ----- People (directory for pickers) -----------------------------------------
export const PeopleQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100).optional().describe('Name or email contains (at least 2 characters)'),
    ids: z
      .string()
      .max(2000)
      .optional()
      .transform((value) => (value ? value.split(',').map((id) => id.trim()).filter(Boolean) : undefined))
      .pipe(z.array(z.uuid()).max(50).optional())
      .describe('Comma-separated user ids to look up'),
    actsForStaff: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true')
      .describe('Only people who can act for staff (out-of-office delegates, roadmap owners)'),
  })
  .refine((query) => query.q !== undefined || query.ids !== undefined, { message: 'Give q or ids' });
export type PeopleQuery = z.infer<typeof PeopleQuerySchema>;

export const PersonSchemaOut = z
  .object({ id: z.uuid(), name: z.string(), email: z.string(), isExternal: z.boolean() })
  .meta({ id: 'Person' });

// ----- Field classification -----------------------------------------------------
// Inline (not a named component), so the web app's contract check compares the values.
const FieldClassEnum = z.enum(FIELD_CLASSES);
export const FieldClassKeySchema = z.string().max(100).regex(/^[a-z][a-z0-9-]*(\.[a-zA-Z][a-zA-Z0-9_-]*)+$/);
export const ClassifiedFieldSchema = z
  .object({
    key: z.string().describe('<module>.<record>.<field>'),
    module: z.string(),
    label: z.string(),
    dataClass: FieldClassEnum.describe('The class in force: financial | contract | personal | internal (seen by anyone who can read the record)'),
    defaultClass: FieldClassEnum.describe('The class in code, used when no administrator has changed it'),
  })
  .meta({ id: 'ClassifiedField' });
export const ClassifiedFieldListSchema = z.object({ items: z.array(ClassifiedFieldSchema) });
export const UpdateFieldClassSchema = z
  .object({ dataClass: FieldClassEnum.nullable().describe('null goes back to the default') })
  .strict()
  .meta({ id: 'UpdateFieldClass' });
export type UpdateFieldClass = z.infer<typeof UpdateFieldClassSchema>;

// ----- Me ------------------------------------------------------------------
export const MeSchema = z
  .object({
    user: z.object({
      id: z.uuid(),
      username: z.string(),
      email: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      isExternal: z.boolean(),
    }),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
    isSystemAdmin: z.boolean(),
    authMethod: z.enum(['api-key', 'session']),
    session: z
      .object({
        accessExpiresAt: z.date().describe('When the access token expires; refresh before then'),
        expiresAt: z.date().describe('Absolute end of the session; sign in again after this'),
      })
      .nullable()
      .describe('Browser session details; null when signed in with an API key'),
  })
  .meta({ id: 'Me' });

// ----- Refused sign-ins ------------------------------------------------------
export const RefusedSignInSchemaOut = z
  .object({
    id: z.uuid(),
    username: z.string().describe('Okta username they signed in with'),
    email: z.string().nullable().describe('As Okta sent it'),
    firstName: z.string(),
    lastName: z.string(),
    attempts: z.number().int(),
    firstAttemptAt: z.date(),
    lastAttemptAt: z.date(),
  })
  .meta({ id: 'RefusedSignIn' });
export const RefusedSignInPageSchema = pageOf(RefusedSignInSchemaOut);
