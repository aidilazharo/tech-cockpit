import { sadSectionPermissions } from '../sad/domain/sections.js';

const PERMISSION_CODE =
  /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:(read|create|update|delete|manage|approve|act|export|run|revoke|reassign)$/;

/** Validates a module's permission map at load time. Values are human descriptions. */
export function definePermissions<const T extends Record<string, string>>(definitions: T): T {
  for (const [code, description] of Object.entries(definitions)) {
    if (!PERMISSION_CODE.test(code)) {
      throw new Error(`Invalid permission code "${code}" (expected <module>:<resource>:<action>)`);
    }
    if (!description.trim()) {
      throw new Error(`Permission "${code}" needs a description`);
    }
  }
  return definitions;
}

export const ACCESS_PERMISSIONS = definePermissions({
  'access:role:read': 'View roles, their permissions and data access',
  'access:role:manage': 'Create, change and delete roles',
  'access:user:read': 'View users',
  'access:user:manage': 'Create users and change their status',
  'access:assignment:read': 'View who holds which role and where',
  'access:assignment:manage': 'Give and remove role assignments',
  'access:department:manage': 'Create and change departments',
  'access:system-admin:manage': 'Grant and remove the system administrator role (never to yourself or to a vendor)',
  'access:field-class:manage': 'Choose which fields count as financial, contract, personal or internal data',
});

export const PEOPLE_PERMISSIONS = definePermissions({
  'people:directory:read': 'Search the staff directory (names and work emails)',
});

export const API_KEY_PERMISSIONS = definePermissions({
  'apikey:own:manage': 'Create, list and revoke your own personal API keys',
  'apikey:any:revoke': 'Revoke any user\'s API key',
});

export const APPROVAL_PERMISSIONS = definePermissions({
  'approvals:rule-set:read': 'View approval rule sets',
  'approvals:rule-set:manage': 'Create, change and publish approval rule sets',
  'approvals:instance:read': 'See approval progress and where it is waiting',
  'approvals:task:act': 'Approve, reject or ask questions on your approval tasks',
  'approvals:task:reassign': 'Reassign anyone\'s approval task',
  'approvals:delegation:manage': 'Set out-of-office delegates for your approvals',
  'approvals:any-delegation:manage': "Set and cancel other people's out-of-office delegates",
  'approvals:instance:manage': 'Act for submitters: resubmit, cancel or answer questions on approvals in your scope',
});

export const AUDIT_PERMISSIONS = definePermissions({
  'audit:log:read': 'Read the audit log',
});

export const PORTFOLIO_PERMISSIONS = definePermissions({
  'portfolio:portfolio:manage': 'Create, rename and deactivate portfolios',
});

export const TRM_PERMISSIONS = definePermissions({
  'trm:application:read': 'View TRM: applications, services, capabilities, servers, software models and product standards',
  'trm:application:update': "Edit applications' TRM fields: TIME rating, functional and technical fit, lifecycle plan dates",
  'trm:application-portfolio:manage': "Set applications' portfolios",
  'trm:source-fields:read': 'View all ServiceNow fields of TRM records (costs and names still follow data access)',
  'trm:sync:run': 'Load ServiceNow exports into TRM and see sync runs',
  'trm:domain:manage': 'Maintain domains and sub-domains, and place applications in them',
  'trm:layer:manage': 'Maintain technology layers and which product-standard categories belong to them',
  'trm:roadmap:read': 'View the EA roadmap',
  'trm:roadmap:manage': 'Create and change EA roadmap initiatives and link planned applications',
  'trm:synced-record:delete': 'Delete ServiceNow records that are no longer in the export',
});

export const SAD_PERMISSIONS = definePermissions({
  ...sadSectionPermissions(),
  'sad:retention:manage': 'Maintain the standard backup retention list that SADs use',
  'sad:draft:manage': 'Cancel any SAD draft in your scope (the person who started a draft can always cancel it)',
  'sad:diagram-defaults:manage': 'Maintain SAD diagram defaults: the hosting names new infrastructure diagrams start with',
});

export const SYSTEM_PERMISSIONS = definePermissions({
  'system:api-docs:read': 'Open the API documentation (Swagger UI)',
});

/** The only place permission codes exist. Add each module's map here. */
export const PERMISSION_CATALOGUE = {
  ...ACCESS_PERMISSIONS,
  ...API_KEY_PERMISSIONS,
  ...APPROVAL_PERMISSIONS,
  ...PEOPLE_PERMISSIONS,
  ...AUDIT_PERMISSIONS,
  ...PORTFOLIO_PERMISSIONS,
  ...TRM_PERMISSIONS,
  ...SAD_PERMISSIONS,
  ...SYSTEM_PERMISSIONS,
};

export type PermissionCode = keyof typeof PERMISSION_CATALOGUE;

export const ALL_PERMISSION_CODES = Object.keys(PERMISSION_CATALOGUE) as PermissionCode[];

export function isPermissionCode(code: string): code is PermissionCode {
  return Object.hasOwn(PERMISSION_CATALOGUE, code);
}
