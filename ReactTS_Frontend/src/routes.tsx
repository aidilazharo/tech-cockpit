import type { ComponentType } from "react";
import type { RouteObject } from "react-router";
import { ProtectedLayout } from "./auth/ProtectedLayout";
import { RequirePermission } from "./auth/RequirePermission";
import { SignInRoute } from "./auth/SignInRoute";
import { RouteError } from "./app-shell/RouteError";
import { HomePage } from "./features/home/HomePage";
import { NotFoundPage } from "./features/not-found/NotFoundPage";
import {
  DIAGRAM_DEFAULTS_MANAGE,
  RETENTION_MANAGE,
  SAD_ANY,
  SAD_APIS,
  SAD_EDIT,
  SAD_VERSION_READERS,
} from "./features/sad/permissions";

/** A page loaded on demand and shown only to holders of `permission` (the API checks again). */
function guarded(
  permission: string | string[],
  load: () => Promise<ComponentType>,
): RouteObject["lazy"] {
  return async () => {
    const Page = await load();
    return {
      Component: () => (
        <RequirePermission permission={permission}>
          <Page />
        </RequirePermission>
      ),
    };
  };
}

/** The Approval Centre is for approvers and for anyone following approvals. */
const APPROVAL_CENTRE = ["approvals:task:act", "approvals:instance:read"];

/** Everything in TRM is visible to holders of the TRM view permission (the API limits scoped roles). */
const TRM = "trm:application:read";

/** Pages that use the screen width up to 1920px (the app shell reads it); the rest stop at 1152px. */
const WIDE = { wide: true };

/** All pages. Everything under ProtectedLayout needs a session. */
export const routes: RouteObject[] = [
  // Public component gallery (no data). Loaded on demand: users never need it.
  {
    path: "/design-system",
    lazy: async () => ({
      Component: (await import("./features/design-system/DesignSystemPage"))
        .DesignSystemPage,
    }),
    errorElement: <RouteError />,
  },
  { path: "/signin", element: <SignInRoute />, errorElement: <RouteError /> },
  {
    element: <ProtectedLayout />,
    errorElement: <RouteError />,
    children: [
      {
        // Pages fail inside the layout, so the navigation stays usable.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          {
            path: "notifications",
            lazy: async () => ({
              Component: (
                await import("./features/notifications/NotificationsPage")
              ).NotificationsPage,
            }),
          },
          {
            path: "approvals",
            lazy: guarded(
              APPROVAL_CENTRE,
              async () =>
                (await import("./features/approvals/ApprovalCentrePage"))
                  .ApprovalCentrePage,
            ),
          },
          {
            path: "approvals/out-of-office",
            lazy: guarded(
              "approvals:delegation:manage",
              async () =>
                (await import("./features/approvals/OutOfOfficePage"))
                  .OutOfOfficePage,
            ),
          },
          {
            path: "approvals/:id",
            lazy: guarded(
              APPROVAL_CENTRE,
              async () =>
                (await import("./features/approvals/ApprovalPage"))
                  .ApprovalPage,
            ),
          },
          {
            path: "admin/out-of-office",
            lazy: guarded(
              "approvals:any-delegation:manage",
              async () =>
                (await import("./features/approvals/OthersOutOfOfficePage"))
                  .OthersOutOfOfficePage,
            ),
          },
          {
            path: "admin/field-classes",
            lazy: guarded(
              "access:field-class:manage",
              async () =>
                (
                  await import("./features/admin/field-classes/FieldClassesPage")
                ).FieldClassesPage,
            ),
          },
          {
            path: "admin/approval-rules",
            lazy: guarded(
              "approvals:rule-set:read",
              async () =>
                (await import("./features/approvals/rules/ApprovalRulesPage"))
                  .ApprovalRulesPage,
            ),
          },
          {
            path: "admin/approval-rules/new",
            lazy: guarded(
              "approvals:rule-set:manage",
              async () =>
                (await import("./features/approvals/rules/RuleSetEditorPage"))
                  .RuleSetEditorPage,
            ),
          },
          {
            path: "admin/approval-rules/:id",
            lazy: guarded(
              "approvals:rule-set:read",
              async () =>
                (await import("./features/approvals/rules/RuleSetEditorPage"))
                  .RuleSetEditorPage,
            ),
          },
          {
            path: "admin/audit-log",
            lazy: guarded(
              "audit:log:read",
              async () =>
                (await import("./features/audit/AuditLogPage")).AuditLogPage,
            ),
          },
          {
            path: "admin/users",
            lazy: guarded(
              "access:user:read",
              async () =>
                (await import("./features/admin/users/UsersPage")).UsersPage,
            ),
          },
          {
            path: "admin/users/:id",
            lazy: guarded(
              "access:user:read",
              async () =>
                (await import("./features/admin/users/UserDetailPage"))
                  .UserDetailPage,
            ),
          },
          {
            path: "admin/roles",
            lazy: guarded(
              "access:role:read",
              async () =>
                (await import("./features/admin/roles/RolesPage")).RolesPage,
            ),
          },
          {
            path: "admin/roles/new",
            lazy: guarded(
              "access:role:manage",
              async () =>
                (await import("./features/admin/roles/RoleEditorPage"))
                  .RoleEditorPage,
            ),
          },
          {
            path: "admin/roles/:id",
            lazy: guarded(
              "access:role:read",
              async () =>
                (await import("./features/admin/roles/RoleEditorPage"))
                  .RoleEditorPage,
            ),
          },
          {
            path: "admin/departments",
            lazy: guarded(
              "access:department:manage",
              async () =>
                (await import("./features/admin/departments/DepartmentsPage"))
                  .DepartmentsPage,
            ),
          },
          {
            path: "trm/landscape",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/LandscapePage")).LandscapePage,
            ),
          },
          {
            path: "trm/roadmap",
            lazy: guarded(
              "trm:roadmap:read",
              async () =>
                (await import("./features/trm/roadmap/RoadmapPage"))
                  .RoadmapPage,
            ),
          },
          {
            path: "trm/roadmap/new",
            lazy: guarded(
              "trm:roadmap:manage",
              async () =>
                (await import("./features/trm/roadmap/InitiativeEditorPage"))
                  .InitiativeEditorPage,
            ),
          },
          {
            path: "trm/roadmap/:id",
            lazy: guarded(
              "trm:roadmap:read",
              async () =>
                (await import("./features/trm/roadmap/InitiativePage"))
                  .InitiativePage,
            ),
          },
          {
            path: "trm/roadmap/:id/edit",
            lazy: guarded(
              "trm:roadmap:manage",
              async () =>
                (await import("./features/trm/roadmap/InitiativeEditorPage"))
                  .InitiativeEditorPage,
            ),
          },
          {
            path: "admin/domains",
            lazy: guarded(
              "trm:domain:manage",
              async () =>
                (await import("./features/admin/trm/DomainsPage")).DomainsPage,
            ),
          },
          {
            path: "admin/technology-layers",
            lazy: guarded(
              "trm:layer:manage",
              async () =>
                (await import("./features/admin/trm/LayersPage")).LayersPage,
            ),
          },
          {
            path: "trm/applications",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/ApplicationsPage"))
                  .ApplicationsPage,
            ),
          },
          {
            path: "trm/applications/:id",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/ApplicationPage"))
                  .ApplicationPage,
            ),
          },
          {
            path: "trm/services",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/ServicesPage")).ServicesPage,
            ),
          },
          {
            path: "trm/services/:id",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/ServicePage")).ServicePage,
            ),
          },
          {
            path: "trm/capabilities",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/CapabilitiesPage"))
                  .CapabilitiesPage,
            ),
          },
          {
            path: "trm/capabilities/:id",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/CapabilityPage")).CapabilityPage,
            ),
          },
          {
            path: "trm/software-models",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/SoftwareModelsPage"))
                  .SoftwareModelsPage,
            ),
          },
          {
            path: "trm/software-models/:id",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/SoftwareModelPage"))
                  .SoftwareModelPage,
            ),
          },
          {
            path: "trm/product-standards",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/ProductStandardsPage"))
                  .ProductStandardsPage,
            ),
          },
          {
            path: "trm/product-standards/:id",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/ProductStandardPage"))
                  .ProductStandardPage,
            ),
          },
          {
            path: "trm/servers",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/ServersPage")).ServersPage,
            ),
          },
          {
            path: "trm/servers/:id",
            lazy: guarded(
              TRM,
              async () =>
                (await import("./features/trm/ServerPage")).ServerPage,
            ),
          },
          {
            path: "admin/trm-sync",
            lazy: guarded(
              "trm:sync:run",
              async () =>
                (await import("./features/trm/SyncRunsPage")).SyncRunsPage,
            ),
          },
          {
            path: "admin/trm-sync/:id",
            lazy: guarded(
              "trm:sync:run",
              async () =>
                (await import("./features/trm/SyncRunPage")).SyncRunPage,
            ),
          },
          {
            path: "admin/trm-missing",
            lazy: guarded(
              "trm:synced-record:delete",
              async () =>
                (await import("./features/trm/MissingRecordsPage"))
                  .MissingRecordsPage,
            ),
          },
          {
            path: "admin/portfolios",
            lazy: guarded(
              "portfolio:portfolio:manage",
              async () =>
                (await import("./features/admin/portfolios/PortfoliosPage"))
                  .PortfoliosPage,
            ),
          },
          {
            path: "sad",
            handle: WIDE,
            lazy: guarded(
              SAD_ANY,
              async () =>
                (await import("./features/sad/SadListPage")).SadListPage,
            ),
          },
          {
            path: "sad/apis",
            handle: WIDE,
            lazy: guarded(
              SAD_APIS,
              async () =>
                (await import("./features/sad/ApiInventoryPage"))
                  .ApiInventoryPage,
            ),
          },
          {
            path: "sad/compare",
            handle: WIDE,
            lazy: guarded(
              SAD_VERSION_READERS,
              async () =>
                (await import("./features/sad/SadComparePage")).SadComparePage,
            ),
          },
          {
            path: "sad/versions/:versionId",
            handle: WIDE,
            lazy: guarded(
              SAD_VERSION_READERS,
              async () =>
                (await import("./features/sad/SadVersionPage")).SadVersionPage,
            ),
          },
          {
            path: "sad/versions/:versionId/edit",
            handle: WIDE,
            lazy: guarded(
              SAD_EDIT,
              async () =>
                (await import("./features/sad/SadEditorPage")).SadEditorPage,
            ),
          },
          {
            path: "sad/:applicationId",
            handle: WIDE,
            lazy: guarded(
              SAD_ANY,
              async () =>
                (await import("./features/sad/SadDocumentPage"))
                  .SadDocumentPage,
            ),
          },
          {
            path: "admin/sad-diagram-defaults",
            handle: WIDE,
            lazy: guarded(
              DIAGRAM_DEFAULTS_MANAGE,
              async () =>
                (await import("./features/admin/sad/DiagramDefaultsPage"))
                  .DiagramDefaultsPage,
            ),
          },
          {
            path: "admin/sad-retention",
            handle: WIDE,
            lazy: guarded(
              RETENTION_MANAGE,
              async () =>
                (await import("./features/admin/sad/RetentionPage"))
                  .RetentionPage,
            ),
          },
          {
            path: "me/api-keys",
            lazy: guarded(
              "apikey:own:manage",
              async () =>
                (await import("./features/me/ApiKeysPage")).ApiKeysPage,
            ),
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
