import { RoleAssignment } from '../modules/access/role-assignment.entity.js';
import { FieldClassOverride } from '../modules/access/field-class.entity.js';
import { Role } from '../modules/access/role.entity.js';
import { ApiKey } from '../modules/api-keys/api-key.entity.js';
import {
  ApprovalDelegation,
  ApprovalEvent,
  ApprovalInstance,
  ApprovalRuleSet,
  ApprovalTask,
  ApprovalWorkflowSetting,
} from '../modules/approvals/approval.entities.js';
import { AuditLog } from '../modules/audit/audit-log.entity.js';
import { AuthSession, SamlRequest } from '../modules/auth/auth.entities.js';
import { Department } from '../modules/identity/department.entity.js';
import { RefusedSignIn } from '../modules/identity/refused-sign-in.entity.js';
import { User } from '../modules/identity/user.entity.js';
import { Notification } from '../modules/notifications/notification.entity.js';
import { Portfolio } from '../modules/portfolios/portfolio.entity.js';
import { SadApi, SadDiagram, SadDiagramDefaults, SadDocument, SadFile, SadRetentionStandard, SadSection, SadUpload, SadVersion } from '../modules/sad/sad.entities.js';
import {
  TrmApplication,
  TrmApplicationPortfolio,
  TrmApplicationSubdomain,
  TrmDomain,
  TrmInitiative,
  TrmInitiativeAction,
  TrmInitiativeCapability,
  TrmLayer,
  TrmLayerMapping,
  TrmPlannedApplication,
  TrmSubdomain,
  TrmApplicationService,
  TrmCapability,
  TrmProductStandard,
  TrmServer,
  TrmService,
  TrmServiceDependency,
  TrmServiceServer,
  TrmServiceSoftware,
  TrmSoftwareModel,
  TrmSyncRecord,
  TrmSyncRun,
} from '../modules/trm/trm.entities.js';

/** Every entity must be listed here; there is no folder-based discovery. */
export const ENTITIES = [
  Department,
  User,
  RefusedSignIn,
  Role,
  RoleAssignment,
  ApiKey,
  AuditLog,
  ApprovalRuleSet,
  ApprovalInstance,
  ApprovalTask,
  ApprovalEvent,
  ApprovalDelegation,
  AuthSession,
  SamlRequest,
  Notification,
  Portfolio,
  TrmCapability,
  TrmProductStandard,
  TrmApplication,
  TrmApplicationPortfolio,
  TrmService,
  TrmServer,
  TrmSoftwareModel,
  TrmApplicationService,
  TrmServiceDependency,
  TrmServiceServer,
  TrmServiceSoftware,
  TrmSyncRun,
  TrmSyncRecord,
  TrmDomain,
  TrmSubdomain,
  TrmApplicationSubdomain,
  TrmLayer,
  TrmLayerMapping,
  TrmPlannedApplication,
  TrmInitiative,
  TrmInitiativeCapability,
  TrmInitiativeAction,
  SadDocument,
  SadVersion,
  SadSection,
  SadDiagram,
  SadDiagramDefaults,
  SadApi,
  SadRetentionStandard,
  SadFile,
  SadUpload,
  FieldClassOverride,
  ApprovalWorkflowSetting,
];
