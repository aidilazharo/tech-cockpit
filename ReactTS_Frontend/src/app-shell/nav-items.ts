import type { ComponentType, SVGProps } from 'react'
import { DIAGRAM_DEFAULTS_MANAGE, RETENTION_MANAGE, SAD_ANY, SAD_APIS } from '../features/sad/permissions'
import {
  ApiIcon,
  AppsIcon,
  BackupIcon,
  BuildingIcon,
  CalendarIcon,
  CapabilityIcon,
  CheckIcon,
  DocumentIcon,
  HomeIcon,
  LandscapeIcon,
  ListIcon,
  PortfolioIcon,
  RoadmapIcon,
  RulesIcon,
  ServerIcon,
  ServiceIcon,
  ShieldIcon,
  SoftwareIcon,
  StandardIcon,
  SyncIcon,
  UsersIcon,
} from '../components/qi/icons'

export interface NavItem {
  to: string
  /** i18n key */
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Shown only to users holding this permission (or any one of several). */
  permission?: string | string[]
  /** Match the path exactly (home). */
  end?: boolean
}

export interface NavSection {
  /** i18n key of the group heading; none for the top group. */
  heading?: string
  items: NavItem[]
}

/** Every module adds its entries here (new-module skill). */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/', label: 'nav.home', icon: HomeIcon, end: true },
      { to: '/approvals', label: 'nav.approvals', icon: CheckIcon, permission: ['approvals:task:act', 'approvals:instance:read'] },
    ],
  },
  {
    heading: 'nav.trm',
    items: [
      { to: '/trm/landscape', label: 'nav.trmLandscape', icon: LandscapeIcon, permission: 'trm:application:read' },
      { to: '/trm/roadmap', label: 'nav.trmRoadmap', icon: RoadmapIcon, permission: 'trm:roadmap:read' },
      { to: '/trm/applications', label: 'nav.trmApplications', icon: AppsIcon, permission: 'trm:application:read' },
      { to: '/trm/services', label: 'nav.trmServices', icon: ServiceIcon, permission: 'trm:application:read' },
      { to: '/trm/capabilities', label: 'nav.trmCapabilities', icon: CapabilityIcon, permission: 'trm:application:read' },
      { to: '/trm/software-models', label: 'nav.trmSoftwareModels', icon: SoftwareIcon, permission: 'trm:application:read' },
      { to: '/trm/product-standards', label: 'nav.trmProductStandards', icon: StandardIcon, permission: 'trm:application:read' },
      { to: '/trm/servers', label: 'nav.trmServers', icon: ServerIcon, permission: 'trm:application:read' },
    ],
  },
  {
    heading: 'nav.architecture',
    items: [
      { to: '/sad', label: 'nav.sad', icon: DocumentIcon, permission: SAD_ANY },
      { to: '/sad/apis', label: 'nav.apiInventory', icon: ApiIcon, permission: SAD_APIS },
    ],
  },
  {
    heading: 'nav.administration',
    items: [
      { to: '/admin/users', label: 'nav.users', icon: UsersIcon, permission: 'access:user:read' },
      { to: '/admin/roles', label: 'nav.roles', icon: ShieldIcon, permission: 'access:role:read' },
      { to: '/admin/departments', label: 'nav.departments', icon: BuildingIcon, permission: 'access:department:manage' },
      { to: '/admin/approval-rules', label: 'nav.approvalRules', icon: RulesIcon, permission: 'approvals:rule-set:read' },
      { to: '/admin/out-of-office', label: 'nav.othersOutOfOffice', icon: CalendarIcon, permission: 'approvals:any-delegation:manage' },
      { to: '/admin/field-classes', label: 'nav.fieldClasses', icon: ShieldIcon, permission: 'access:field-class:manage' },
      { to: '/admin/audit-log', label: 'nav.auditLog', icon: ListIcon, permission: 'audit:log:read' },
      { to: '/admin/portfolios', label: 'nav.portfolios', icon: PortfolioIcon, permission: 'portfolio:portfolio:manage' },
      { to: '/admin/domains', label: 'nav.domains', icon: BuildingIcon, permission: 'trm:domain:manage' },
      { to: '/admin/technology-layers', label: 'nav.technologyLayers', icon: ListIcon, permission: 'trm:layer:manage' },
      { to: '/admin/trm-sync', label: 'nav.trmSync', icon: SyncIcon, permission: 'trm:sync:run' },
      { to: '/admin/trm-missing', label: 'nav.trmMissing', icon: ListIcon, permission: 'trm:synced-record:delete' },
      { to: '/admin/sad-retention', label: 'nav.sadRetention', icon: BackupIcon, permission: RETENTION_MANAGE },
      { to: '/admin/sad-diagram-defaults', label: 'nav.sadDiagramDefaults', icon: LandscapeIcon, permission: DIAGRAM_DEFAULTS_MANAGE },
    ],
  },
]
