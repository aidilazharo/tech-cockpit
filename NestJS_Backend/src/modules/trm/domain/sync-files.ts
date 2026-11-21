/** The exports the product owner's Node application produces (file name without .json). */
export const SYNC_FILES = [
  'business_application',
  'mapped_application_service',
  'business_service',
  'business_capability',
  'product_standard',
  'ba_as_sm',
  'ba_as_bs',
  'ba_as_server',
] as const;
export type SyncFile = (typeof SYNC_FILES)[number];
