import type { ApplicationCall } from '../schemas'

// Calls for tests: CRM's SAD says CRM calls Billing (twice: two connections) and Billing calls CRM;
// Customer Portal's SAD says it calls CRM (the reader cannot read its section 2).
export const CRM = { id: '80000000-0000-4000-8000-000000000001', name: 'CRM', number: 'APM-0001' }
export const BILLING = { id: 'ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1', name: 'Billing', number: 'APM-0011' }
export const PORTAL = { id: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d', name: 'Customer Portal', number: 'APM-0005' }
const crmSad = { applicationId: CRM.id, applicationName: 'CRM', versionId: '7b000000-0000-4000-8000-000000000002', number: 2, approvedAt: '2026-08-14T02:00:00.000Z' }
const portalSad = { applicationId: PORTAL.id, applicationName: 'Customer Portal', versionId: '7b000000-0000-4000-8000-000000000005', number: 4, approvedAt: '2026-06-02T02:00:00.000Z' }

export const calls: ApplicationCall[] = [
  { caller: CRM, callee: BILLING, calls: 'Billing API: create invoice', does: 'Bills premiums', restricted: false, twoWay: true, source: crmSad },
  { caller: BILLING, callee: CRM, calls: 'CRM Customer API', does: null, restricted: false, twoWay: false, source: crmSad },
  { caller: PORTAL, callee: CRM, calls: null, does: null, restricted: true, twoWay: false, source: portalSad },
  { caller: CRM, callee: BILLING, calls: 'Invoice file', does: 'Nightly invoices', restricted: false, twoWay: false, source: crmSad },
]
