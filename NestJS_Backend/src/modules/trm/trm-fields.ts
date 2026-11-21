import type { ClassifiedField } from '../access/field-classes.js';

/** TRM's classified structured fields: application costs and people, service owner, roadmap cost and owner. */
export const APPLICATION_COSTS = ['licenceCost', 'internalSupportCost', 'externalSupportCost', 'infraOnPremisesCost', 'infraCloudCost'] as const;
export const APPLICATION_PEOPLE = ['itApplicationOwner', 'applicationLead', 'applicationManager'] as const;
export type ApplicationField = (typeof APPLICATION_COSTS)[number] | (typeof APPLICATION_PEOPLE)[number];

const LABELS: Record<ApplicationField, string> = {
  licenceCost: 'Application: licence cost',
  internalSupportCost: 'Application: internal support cost',
  externalSupportCost: 'Application: external support cost',
  infraOnPremisesCost: 'Application: on-premises infrastructure cost',
  infraCloudCost: 'Application: cloud infrastructure cost',
  itApplicationOwner: 'Application: IT application owner',
  applicationLead: 'Application: application lead',
  applicationManager: 'Application: application manager',
};

export const applicationField = (field: ApplicationField) => `trm.application.${field}`;
export const SERVICE_OWNER = 'trm.service.ownedBy';
export const INITIATIVE_COST = 'trm.initiative.estimatedCost';
export const INITIATIVE_OWNER = 'trm.initiative.owner';

export const TRM_FIELDS: ClassifiedField[] = [
  ...APPLICATION_COSTS.map((field) => ({ key: applicationField(field), module: 'trm', label: LABELS[field], defaultClass: 'financial' as const })),
  ...APPLICATION_PEOPLE.map((field) => ({ key: applicationField(field), module: 'trm', label: LABELS[field], defaultClass: 'personal' as const })),
  { key: SERVICE_OWNER, module: 'trm', label: 'Service: owned by', defaultClass: 'personal' },
  { key: INITIATIVE_COST, module: 'trm', label: 'Roadmap initiative: estimated cost', defaultClass: 'financial' },
  { key: INITIATIVE_OWNER, module: 'trm', label: 'Roadmap initiative: owner', defaultClass: 'personal' },
];
