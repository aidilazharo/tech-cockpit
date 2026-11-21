/**
 * SAD sections in template order (AIA Malaysia's strict SAD template plus the API inventory).
 * Each section has its own View and Edit permission: sad:<key>:read and sad:<key>:update.
 */
export const SAD_SECTIONS = [
  { key: 'application-details', title: 'Application Details' },
  { key: 'solution-integration', title: 'Solution & Integration Architecture' },
  { key: 'network', title: 'Physical and Network Architecture' },
  { key: 'resiliency', title: 'High Availability and Resiliency Architecture' },
  { key: 'security-design', title: 'Security Architecture Design' },
  { key: 'api-inventory', title: 'API Inventory' },
  { key: 'data-protection', title: 'Data Protection' },
  { key: 'security-iam', title: 'Security, Identity & Access Management' },
  { key: 'data-architecture', title: 'Data Architecture & Data Flow' },
  { key: 'deployment', title: 'Deployment Architecture' },
  { key: 'environment', title: 'Environment Details' },
  { key: 'logging', title: 'Logging & Monitoring' },
  { key: 'backup', title: 'Backup Details and Architecture' },
] as const;

export type SadSectionKey = (typeof SAD_SECTIONS)[number]['key'];
export const SAD_SECTION_KEYS = SAD_SECTIONS.map((section) => section.key) as SadSectionKey[];

export type SadReadPermission = `sad:${SadSectionKey}:read`;
export type SadUpdatePermission = `sad:${SadSectionKey}:update`;

export const sadRead = (section: SadSectionKey): SadReadPermission => `sad:${section}:read`;
export const sadUpdate = (section: SadSectionKey): SadUpdatePermission => `sad:${section}:update`;

/** The catalogue entries: View and Edit per section. */
export function sadSectionPermissions(): Record<SadReadPermission | SadUpdatePermission, string> {
  return Object.fromEntries(
    SAD_SECTIONS.flatMap(({ key, title }) => [
      [sadRead(key), `SAD: view the "${title}" section`],
      [sadUpdate(key), `SAD: edit the "${title}" section of drafts`],
    ]),
  ) as Record<SadReadPermission | SadUpdatePermission, string>;
}
