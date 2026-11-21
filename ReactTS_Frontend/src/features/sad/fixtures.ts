import { emptyContent } from './diagrams/model'
import type { Api, DiagramSlotData, ListItem, Overview, RetentionStandard, SadSectionKey, Template, Version } from './schemas'
import { SAD_SECTION_KEYS } from './schemas'

export const APP_CRM = '80000000-0000-4000-8000-000000000001'
export const APP_BILLING = '80000000-0000-4000-8000-000000000002'
export const VERSION_ID = '8c000000-0000-4000-8000-000000000001'
export const CURRENT_ID = '8c000000-0000-4000-8000-000000000002'
export const INSTANCE_ID = '8d000000-0000-4000-8000-000000000001'
export const STANDARD_ID = '8e000000-0000-4000-8000-000000000001'
export const STANDARD_2 = '8e000000-0000-4000-8000-000000000002'
export const ADA = { id: '00000000-0000-4000-8000-000000000001', name: 'Ada Admin' }

const opts = (...labels: string[]) => labels.map((label) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label }))
const CLASSIFICATIONS = opts('Public', 'Internal', 'Confidential', 'Highly Confidential')
const one = (key: SadSectionKey, title: string): Template['sections'][number] => ({
  key,
  title,
  references: [],
  groups: [{ key: 'main', items: [{ type: 'short', key: `${key}-note`, label: `${title} notes` }] }],
})

/** A small template using every question type and rule. */
export const template: Template = {
  version: 1,
  sections: [
    {
      key: 'application-details',
      title: 'Application Details',
      intro: 'From TRM where it holds the value.',
      references: [],
      groups: [
        {
          key: 'details',
          items: [
            { type: 'trm', key: 'app-name', label: 'Application Name', source: 'name', fallback: { type: 'none' } },
            { type: 'trm', key: 'data-classification', label: 'Data Classification', source: 'dataClassification', fallback: { type: 'choice', options: CLASSIFICATIONS } },
            { type: 'trm', key: 'supporting-entity', label: 'Supporting Entity', source: 'ownedBusinessUnit' },
            { type: 'trm', key: 'business-owner', label: 'Business Owner', source: 'businessOwner', personal: true },
            { type: 'trm', key: 'portfolio', label: 'Portfolio', source: 'portfolios' },
            { type: 'yesno', key: 'icfr', label: 'ICFR Application' },
          ],
        },
      ],
    },
    {
      key: 'solution-integration',
      title: 'Solution & Integration Architecture',
      references: ['ITSR.016 Network Security Standard'],
      retired: [{ key: 'communication-matrix', label: 'Source and destination communication matrix', type: 'text', removedIn: 2 }],
      groups: [
        {
          key: 'solution',
          diagrams: [
            { slot: 'solution', view: 'solution' },
            { slot: 'infrastructure', view: 'integration' },
          ],
          items: [
            { type: 'text', key: 'solution-overview', label: 'General overview' },
            { type: 'multi', key: 'hosting-location', label: 'Application hosting location', options: opts('AIA Azure', 'AIA SSDC', '3rd party SaaS'), other: true },
            { type: 'multi', key: 'accessibility', label: 'Application accessibility', options: opts('Internal', 'External', 'Internet') },
            {
              type: 'multi',
              key: 'internet-protection',
              label: 'Internet-facing protection',
              options: opts('WAF', 'Firewall'),
              showWhen: { question: 'accessibility', anyOf: ['external', 'internet'] },
            },
          ],
        },
        {
          key: 'aia-hosted',
          title: 'Application hosted in AIA Azure and PDC/SDC',
          intro: 'For servers in AIA data centres and Azure.',
          showWhen: { question: 'hosting-location', anyOf: ['aia-azure', 'aia-ssdc'] },
          items: [
            { type: 'note', key: 'azure-note', text: 'Answer for AIA-hosted applications.' },
            { type: 'yesno', key: 'vm-check-in', label: 'Server/VM check-in process', detailsLabel: 'How' },
          ],
        },
      ],
    },
    // Section 3 draws the infrastructure diagram.
    { ...one('network', 'Physical and Network Architecture'), groups: [{ ...one('network', 'Physical and Network Architecture').groups[0], diagrams: [{ slot: 'infrastructure', view: 'infrastructure' }] }] },
    {
      key: 'resiliency',
      title: 'High Availability and Resiliency Architecture',
      references: [],
      groups: [{ key: 'dr', items: [{ type: 'date', key: 'dr-test-date', label: 'Last DR test' }] }],
    },
    {
      key: 'security-design',
      title: 'Security Architecture Design',
      references: [],
      groups: [
        {
          key: 'iam',
          title: 'Identity and Access Management',
          items: [
            { type: 'links', key: 'acacm-link', label: 'Link to your latest ACACM document' },
            { type: 'choice', key: 'authentication-method', label: 'Authentication method', options: opts('Okta SSO', 'Local custom authentication'), other: true },
            { type: 'text', key: 'local-auth-justification', label: 'Why the application does its own authentication', allowNotApplicable: false },
            { type: 'number', key: 'user-count', label: 'Number of users', unit: 'users' },
            {
              type: 'table',
              key: 'security-scans',
              label: 'Security scans',
              addRows: false,
              fixedRows: ['Veracode SAST & SCA scan', 'Tenable vulnerability scan'],
              columns: [
                { key: 'status', label: 'Status', type: 'choice', options: opts('Done', 'Planned') },
                { key: 'lastDate', label: 'Last date', type: 'date', optional: true },
              ],
            },
            {
              type: 'table',
              key: 'role-permissions',
              label: 'Roles and authorised permissions',
              addRows: true,
              fixedRows: ['Application User'],
              columns: [{ key: 'permission', label: 'Authorized permission', type: 'text' }],
            },
            { type: 'yesno', key: 'uses-apis', label: 'Are any APIs used in the application?', hint: 'Answer Yes to fill the API inventory.' },
            { type: 'multi', key: 'api-auth', label: 'API authentication mechanism', options: opts('Key based', 'OAuth 2.0'), showWhen: { question: 'uses-apis', anyOf: ['yes'] } },
            { type: 'number', key: 'api-session-timeout', label: 'API session timeout', unit: 'minutes' },
            {
              type: 'yesno',
              key: 'api-refresh-token',
              label: 'An API refresh token is implemented',
              warning: { text: 'The API session timeout is more than 15 minutes: there should be an API refresh token along with the access token.', when: [{ question: 'api-session-timeout', over: 15 }, { question: 'api-refresh-token', anyOf: ['no'] }] },
            },
          ],
        },
      ],
    },
    {
      key: 'api-inventory',
      title: 'API Inventory',
      intro: 'All APIs, inventoried and classified.',
      references: [],
      groups: [
        {
          key: 'apis',
          showWhen: { question: 'uses-apis', anyOf: ['yes'] },
          items: [
            {
              type: 'table',
              key: 'apis',
              label: 'APIs',
              addRows: true,
              columns: [
                { key: 'name', label: 'API name', type: 'text' },
                { key: 'apiOwner', label: 'API owner', type: 'person', personal: true },
                { key: 'productionUrl', label: 'Production URL', type: 'text', optional: true },
                { key: 'uatUrl', label: 'UAT URL', type: 'text', optional: true },
                { key: 'devUrl', label: 'DEV URL', type: 'text', optional: true },
                { key: 'thirdParty', label: 'Third-party API', type: 'yesno' },
                { key: 'calls', label: 'Calls per day', type: 'number', optional: true },
                { key: 'dependencies', label: 'Dependent applications', type: 'applications', optional: true },
                { key: 'priority', label: 'Priority', type: 'choice', options: opts('Critical', 'High', 'Medium', 'Low') },
                { key: 'data', label: 'Data connected to the API', type: 'dataObjects' },
              ],
              oneOf: [['productionUrl', 'uatUrl', 'devUrl']],
            },
          ],
        },
      ],
    },
    one('data-protection', 'Data Protection'),
    one('security-iam', 'Security, Identity & Access Management'),
    // Section 9 shows the solution diagram's Data flow view.
    { ...one('data-architecture', 'Data Architecture & Data Flow'), groups: [{ ...one('data-architecture', 'Data Architecture & Data Flow').groups[0], diagrams: [{ slot: 'solution', view: 'data-flow' }] }] },
    one('deployment', 'Deployment Architecture'),
    {
      key: 'environment',
      title: 'Environment Details',
      references: [],
      groups: [{ key: 'env', items: [{ type: 'trm', key: 'trm-environment', label: 'From TRM', source: 'environment', fallback: { type: 'none' } }] }],
    },
    one('logging', 'Logging & Monitoring'),
    {
      key: 'backup',
      title: 'Backup Details and Architecture',
      references: ['ITSR.004 Cryptography Standard'],
      groups: [{ key: 'schedule', title: 'Backup schedule', items: [{ type: 'retention', key: 'backup-schedule', label: 'Cloud services backup schedule' }] }],
    },
  ],
}

/** A draft the reader can view and edit completely, nothing answered yet. */
export function version(overrides: Partial<Version> = {}): Version {
  return {
    id: VERSION_ID,
    application: { id: APP_CRM, name: 'CRM', number: 'APM-1' },
    status: 'draft',
    number: null,
    draftOf: 2,
    templateVersion: 1,
    startedBy: ADA,
    startedAt: '2026-10-20T02:00:00.000Z',
    submittedBy: null,
    submittedAt: null,
    approvedAt: null,
    approvalInstanceId: null,
    approvalStatus: null,
    asApprover: false,
    namesHidden: false,
    trm: {
      values: {
        name: 'CRM',
        dataClassification: null,
        ownedBusinessUnit: 'AIA Bhd',
        businessOwner: 'Bob Owner',
        portfolios: ['Group', 'Retail'],
        environment: [{ name: 'CRM Prod', environment: 'Production', servers: ['srv-1'], software: [{ name: 'PostgreSQL', version: '15', standard: 'PostgreSQL', standardStatus: 'Standard' }] }],
      },
      restricted: [],
      live: true,
    },
    sections: SAD_SECTION_KEYS.map((key) => ({ key, readable: true, editable: true, rowVersion: 0, answers: {} })),
    completion: SAD_SECTION_KEYS.map((section) => ({ section, total: 2, answered: 0, missing: ['x', 'y'] })),
    hidden: ['vm-check-in', 'internet-protection', 'api-auth', 'apis'],
    canSubmit: true,
    canCancel: true,
    retention: [],
    localAuthentication: null,
    history: [{ action: 'started', user: ADA, step: null, comment: null, at: '2026-10-01T01:00:00.000Z' }],
    ...overrides,
  }
}

export function overview(overrides: Partial<Overview> = {}): Overview {
  return {
    application: { id: APP_CRM, name: 'CRM', number: 'APM-1' },
    current: { versionId: CURRENT_ID, number: 1, approvedAt: '2026-10-01T04:00:00.000Z' },
    open: {
      versionId: VERSION_ID,
      status: 'draft',
      draftOf: 2,
      startedBy: ADA,
      startedAt: '2026-10-20T02:00:00.000Z',
      submittedAt: null,
      approvalInstanceId: null,
      approvalStatus: null,
    },
    history: [{ versionId: CURRENT_ID, number: 1, approvedAt: '2026-10-01T04:00:00.000Z', status: 'current' }],
    readable: [...SAD_SECTION_KEYS],
    editable: [...SAD_SECTION_KEYS],
    canStartDraft: false,
    localAuthentication: null,
    ...overrides,
  }
}

export function listItem(overrides: Partial<ListItem> = {}): ListItem {
  return { applicationId: APP_CRM, name: 'CRM', number: 'APM-1', current: { versionId: CURRENT_ID, number: 1, approvedAt: '2026-10-01T04:00:00.000Z' }, open: null, localAuthentication: null, ...overrides }
}

export function apiRow(overrides: Partial<Api> = {}): Api {
  return {
    id: '8f000000-0000-4000-8000-000000000001',
    application: { id: APP_CRM, name: 'CRM' },
    versionId: CURRENT_ID,
    name: 'Policy API',
    description: 'Policies for agents',
    apiOwner: ADA,
    businessOwner: null,
    productionUrl: 'https://api.aia.com/policy',
    uatUrl: null,
    devUrl: null,
    authMethod: 'oauth-2-0',
    hosting: 'cloud',
    thirdParty: false,
    classification: 'confidential',
    data: [{ object: 'Customer', attributes: 'name, IC number' }],
    dependencies: { items: [{ id: APP_BILLING, name: 'Billing' }], other: 'Mainframe' },
    priority: 'critical',
    justification: 'Customer data',
    namesHidden: false,
    ...overrides,
  }
}

export const retention: RetentionStandard[] = [
  { id: STANDARD_ID, version: 1, position: 1, serviceType: 'Database - MsSQL on VM', dataType: 'Financial Transaction', yearly: '8 Years', monthly: '12 months', weekly: '5 weeks', daily: '7 days', comment: null, active: true },
  { id: STANDARD_2, version: 1, position: 2, serviceType: 'Storage Account - Blob Container', dataType: 'Non-business data', yearly: '-', monthly: '-', weekly: '-', daily: '-', comment: '7 days soft delete', active: true },
]

/** Section 2 draws the solution diagram; the infrastructure (drawn in section 3) shows read-only as its integration view. */
export function diagramSlots(overrides: { solutionEditable?: boolean } = {}): DiagramSlotData[] {
  const page = (id: string, title: string, extra: object = {}) => ({ id, title, sizing: 'auto' as const, zones: [], boxes: [], lines: [], ...extra })
  return [
    {
      slot: 'solution',
      owner: 'solution-integration',
      readableViews: ['solution', 'data-flow'],
      editableViews: (overrides.solutionEditable ?? true) ? ['solution', 'data-flow'] : [],
      rowVersion: 0,
      hidden: [],
      content: { diagrams: [page('solution', 'Solution diagram')] },
    },
    {
      slot: 'infrastructure',
      owner: 'network',
      readableViews: ['infrastructure', 'integration'],
      editableViews: [],
      rowVersion: 2,
      hidden: [],
      // The hosting settings and fixed zones, with CRM's web app in the primary region.
      content: (({ hosting, diagrams }) => ({
        hosting,
        diagrams: [{ ...diagrams[0], boxes: [{ id: 'box-1', label: 'CRM web', type: 'web', parentId: 'primary-region', x: 20, y: 40 }] }, diagrams[1]],
      }))(emptyContent('infrastructure', 'CRM')),
    },
  ]
}
