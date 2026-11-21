import type { DiagramSlot, DiagramView } from './diagrams.js';
import type { SadSectionKey } from './sections.js';
import type {
  ChoiceQuestion,
  DiagramRef,
  Condition,
  Group,
  LinksQuestion,
  MultiQuestion,
  Note,
  NumberQuestion,
  Option,
  RetiredQuestion,
  RichTextQuestion,
  SadTemplate,
  ShortTextQuestion,
  TableColumn,
  TableQuestion,
  TrmQuestion,
  TrmSource,
  Warning,
  YesNoQuestion,
} from './template-types.js';

// AIA Malaysia's strict SAD template (docs/template/SAD_Template.pdf) plus the API inventory,
// as confirmed in docs/modules/sad.md. Changing questions needs a release: bump the version.

export const SAD_TEMPLATE_VERSION = 3;

/**
 * Questions asked once that AIA's template has in two places (2026-10-25): the PDF also prints the answer of `from`
 * in `group` of `section`, before `before`, under `label` (only for readers of the section `from` is in).
 */
export const SAD_PRINTED_TWICE: { section: SadSectionKey; group: string; before: string; label: string; from: string }[] = [
  { section: 'security-design', group: 'application-security', before: 'ci-cd', label: 'How the application is deployed across all environments, including the deployment tools', from: 'deployment-environments' },
  { section: 'security-design', group: 'application-security', before: 'integrations', label: 'Session timeout of the application', from: 'password-session-timeout' },
];

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const options = (...labels: string[]): Option[] => labels.map((label) => ({ value: slug(label), label }));

type Extra = { hint?: string; showWhen?: Condition; warning?: Warning; allowNotApplicable?: false; personal?: boolean };
const text = (key: string, label: string, extra: Extra = {}): RichTextQuestion => ({ type: 'text', key, label, ...extra });
const short = (key: string, label: string, extra: Extra = {}): ShortTextQuestion => ({ type: 'short', key, label, ...extra });
const yesno = (key: string, label: string, extra: Extra & { detailsLabel?: string } = {}): YesNoQuestion => ({ type: 'yesno', key, label, ...extra });
// Every single and multiple choice question offers "Other (specify)" (2026-10-25).
const choice = (key: string, label: string, choices: Option[], extra: Extra = {}): ChoiceQuestion => ({
  type: 'choice',
  key,
  label,
  options: choices,
  other: true,
  ...extra,
});
const multi = (key: string, label: string, choices: Option[], extra: Extra = {}): MultiQuestion => ({
  type: 'multi',
  key,
  label,
  options: choices,
  other: true,
  ...extra,
});
const number = (key: string, label: string, unit: string, extra: Extra = {}): NumberQuestion => ({ type: 'number', key, label, unit, ...extra });
const links = (key: string, label: string, extra: Extra = {}): LinksQuestion => ({ type: 'links', key, label, ...extra });
const trm = (key: string, label: string, source: TrmSource, extra: Extra & { fallback?: TrmQuestion['fallback'] } = {}): TrmQuestion => ({
  type: 'trm',
  key,
  label,
  source,
  ...extra,
});
const column = (key: string, label: string, extra: Partial<TableColumn> = {}): TableColumn => ({ key, label, type: 'text', ...extra });
const table = (key: string, label: string, columns: TableColumn[], extra: Partial<TableQuestion> = {}): TableQuestion => ({
  type: 'table',
  key,
  label,
  columns,
  addRows: true,
  ...extra,
});
const note = (key: string, noteText: string): Note => ({ type: 'note', key, text: noteText });
const retired = (key: string, label: string, removedIn: number, type: RetiredQuestion['type'] = 'text', unit?: string): RetiredQuestion => ({ key, label, type, removedIn, ...(unit ? { unit } : {}) });

const CLASSIFICATIONS = options('Public', 'Internal', 'Confidential', 'Highly Confidential');
const YES: Pick<Condition, 'anyOf'> = { anyOf: ['yes'] };
const usesApis: Condition = { question: 'uses-apis', ...YES };
const localAuthentication: Condition = { question: 'authentication-method', anyOf: ['local-custom-authentication', 'other'] };
const usesGenAi: Condition = { question: 'uses-genai', ...YES };
const thirdPartyAccess: Condition = { question: 'third-party-access', anyExcept: ['none'] };
const databaseColumns = () => [column('environment', 'Environment'), column('server', 'SQL Server'), column('database', 'Database'), column('function', 'Function'), column('ownership', 'Ownership')];

const group = (key: string, items: Group['items'], extra: Omit<Group, 'key' | 'items'> = {}): Group => ({ key, items, ...extra });
const diagram = (slot: DiagramSlot, view: DiagramView): DiagramRef => ({ slot, view });

export const SAD_TEMPLATE: SadTemplate = {
  version: SAD_TEMPLATE_VERSION,
  sections: [
    {
      key: 'application-details',
      title: 'Application Details',
      intro: 'From TRM (ServiceNow) where it holds the value; otherwise answered here.',
      references: [],
      groups: [
        group('details', [
          trm('app-name', 'Application Name', 'name', { fallback: { type: 'none' } }),
          trm('supporting-entity', 'Supporting Entity', 'ownedBusinessUnit'),
          trm('apm-id', 'APM ID', 'number', { fallback: { type: 'none' } }),
          trm('app-description', 'Description', 'description'),
          trm('app-capability', 'Capability', 'capability'),
          choice('external-internal', 'External / Internal Application', options('External', 'Internal')),
          short('asr', 'Application Security Rating (ASR)'),
          trm('bia-classification', 'BIA Classification', 'bcmCriticality'),
          yesno('bnm-critical', 'BNM Critical'),
          yesno('icfr', 'ICFR Application'),
          yesno('pci-dss', 'PCI-DSS'),
          trm('rpo-rto', 'RPO / RTO', 'rpoRto'),
          trm('data-classification', 'Data Classification', 'dataClassification', { fallback: { type: 'choice', options: CLASSIFICATIONS } }),
          trm('business-owner', 'Business Owner', 'businessOwner', { personal: true }),
          trm('apm-name', 'Business Application Name (APM)', 'displayName'),
          trm('application-owner', 'Application Owner', 'itApplicationOwner', { personal: true }),
          trm('application-manager', 'Application Manager', 'applicationManager', { personal: true }),
          trm('product-manager', 'Product Manager', 'productManagers', { personal: true }),
          trm('application-lead', 'Application Lead', 'applicationLead', { personal: true }),
          trm('portfolio-lead', 'Portfolio Lead', 'portfolioLeads', { personal: true }),
          trm('portfolio', 'Portfolio', 'portfolios'),
        ]),
      ],
    },
    {
      key: 'solution-integration',
      title: 'Solution & Integration Architecture',
      references: ['ITSR.020 Third Party Security Standard', 'ITSR.045 Cloud Security Standard', 'ITSR.016 Network Security Standard', 'ITSR.035 System Configuration Security Standard'],
      // Version 2: the solution diagram and its logical matrix replace these.
      retired: [
        retired('solution-diagram', 'Solution diagrams using the latest Azure icons, and integration with other solution components', 2),
        retired('communication-matrix', 'Source and destination communication matrix', 2),
      ],
      groups: [
        group(
          'solution',
          [
            text('solution-overview', 'General overview of the solution architecture: Azure services and non-Azure services used (e.g. Function App, API, Azure AD, Front Door, Storage Account)'),
            text('service-model-decision', 'Decision factors behind using specific services: why IaaS, PaaS or SaaS'),
            // "AIA SSDC" was renamed "AIA PDC/SDC" (2026-10-23); its stored value stays, so answers and show/hide rules still match.
            multi('hosting-location', 'Application hosting location', [...options('AIA Azure'), { value: 'aia-ssdc', label: 'AIA PDC/SDC' }, ...options('3rd party SaaS')]),
            multi('accessibility', 'Application accessibility', options('Internal', 'External', 'Internet')),
            multi('internet-protection', 'Internet-facing application protection technology', options('WAF', 'Anti-DDoS', 'IDS/IPS', 'Firewall'), {
              showWhen: { question: 'accessibility', anyOf: ['external', 'internet'] },
            }),
          ],
          { diagrams: [diagram('solution', 'solution'), diagram('infrastructure', 'integration')] },
        ),
        group(
          'aia-hosted',
          [
            yesno('vm-check-in', 'Server/VM check-in process (e.g. the AIA standard check-in process is followed, with security agents installed on the server/VM)'),
            text('base-image', 'Source of base image (e.g. AIA approved base image)'),
            text('container-orchestration', 'Container orchestration solution (e.g. Azure Kubernetes Service)'),
            multi('paas-network-restriction', 'Network access restriction for Azure PaaS services', options('Service endpoint', 'Private endpoint', 'vNET integration', 'Built-in firewall setting')),
            multi('external-connection', 'Connection between the external network (e.g. SaaS vendor environment) and the AIA network', options('ExpressRoute', 'Private Link', 'VPN', 'Through AIA firewall')),
            yesno('ecc-pcc', 'ECC/PCC process (e.g. the AIA Skybox ECC/PCC process is followed)'),
          ],
          { title: 'Application hosted in AIA Azure and PDC/SDC', showWhen: { question: 'hosting-location', anyOf: ['aia-azure', 'aia-ssdc'] } },
        ),
        group(
          'third-party-hosted',
          [
            yesno('tpsa', 'Has a TPSA been conducted? Give the TPM / TPSA ID for the 3rd party, if applicable', { detailsLabel: 'TPM / TPSA ID' }),
            yesno('ip-whitelisting', 'IP whitelisting (e.g. configured in Okta or the SaaS service to allow access only from the AIA internal network)'),
            multi('csp-certifications', 'The 3rd-party CSP is certified with', options('ISO 27001', 'ISO 27017', 'CSA STAR Level 2', 'SOC 2 Type 2', 'PCI-DSS')),
            note('soc2-note', 'The controls below can refer to statements from the SOC 2 or ISO 27001 report.'),
            text('vulnerability-management', 'Vulnerability management (tools or process)'),
            text('system-hardening', 'System hardening (tools or process)'),
            text('patch-management', 'Patch management (tools or process)'),
            text('data-segregation', 'Data segregation (e.g. dedicated physical server or database, logical isolation)'),
            multi('security-agents', 'Security agents on servers/VMs', options('Antivirus', 'EDR', 'SIEM', 'DLP')),
          ],
          { title: 'Application hosted in 3rd party or SaaS', showWhen: { question: 'hosting-location', anyOf: ['3rd-party-saas'] } },
        ),
      ],
    },
    {
      key: 'network',
      title: 'Physical and Network Architecture',
      references: ['ITSR.016 Network Security Standard', 'ITSR.035 System Configuration Security Standard'],
      // Version 2: the infrastructure diagram replaces it.
      retired: [retired('network-architecture', 'Network architecture (including WAF, VNET, subnet, private endpoint etc.)', 2)],
      groups: [
        group(
          'network',
          [table('application-urls', 'URLs configured for the application', [column('environment', 'Environment'), column('url', 'URL'), column('description', 'Description', { optional: true })])],
          { diagrams: [diagram('infrastructure', 'infrastructure')] },
        ),
        group(
          'databases',
          [table('databases-owned', 'Databases owned by the application', databaseColumns()), table('databases-consumed', 'Databases consumed by the application', databaseColumns())],
          { title: 'List of Databases' },
        ),
      ],
    },
    {
      key: 'resiliency',
      title: 'High Availability and Resiliency Architecture',
      references: ['Group Business Continuity Management Standard'],
      groups: [
        group(
          'dr',
          [
            text('dr-plan', 'DR architecture and DR plan'),
            table('resiliency-table', 'High availability and resiliency', [
              column('infrastructure', 'Azure Infrastructure'),
              column('availability', 'High Availability'),
              column('sla', 'SLA'),
              column('resiliency', 'Resiliency Architecture'),
            ]),
          ],
          { diagrams: [diagram('infrastructure', 'infrastructure')] },
        ),
      ],
    },
    {
      key: 'security-design',
      title: 'Security Architecture Design',
      // Version 3: SailPoint becomes the IAM integration question; the session timeout and deployment question are asked once.
      retired: [
        retired('sailpoint', 'Application integrated with SailPoint for user recertification or access governance (ICFR applications)', 3, 'yesno'),
        retired('deployment-details', 'How the application is deployed across all environments, including the deployment tools', 3),
        retired('app-session-timeout', 'Session timeout of the application', 3, 'number', 'minutes'),
      ],
      references: [
        'ITSR.037 User Identity & Access Management Standard',
        'ITSR.048 Customer Authentication Standard',
        'ITSR.040 Application Security Standard',
        'ITSR.047 Mobile Application Security Standard',
        'ITSR.049 Container Security Standard',
        'Group Application Programming Interface (API) Standard',
        'Responsible Use of Artificial Intelligence Standard',
        'End-User Developed Tools (EUDT) Standard',
      ],
      groups: [
        group('iam', [links('acacm-link', 'Link to your latest ACACM document')], { title: 'Identity and Access Management' }),
        group(
          'user-authentication',
          [
            multi('application-type', 'Type of application', options('Web', 'Mobile', 'Thick client')),
            choice('authentication-method', 'Authentication method used in the application', options('AD based', 'Okta SSO', 'Okta CIAM', 'ForgeRock CIAM', 'Local custom authentication')),
            // Local custom or Other flags the application (local authentication).
            text('local-auth-justification', 'Why the application does its own authentication', { showWhen: localAuthentication, allowNotApplicable: false }),
          ],
          { title: 'User Authentication' },
        ),
        group(
          'password-settings',
          [
            number('password-min-length', 'Minimum length', 'characters'),
            number('password-expiry', 'Password expiration', 'days'),
            number('password-history', 'Password history', 'previous passwords'),
            number('account-lockout', 'Account lockout', 'failed attempts'),
            number('password-session-timeout', 'Session timeout', 'minutes'),
          ],
          // Asked for every application (2026-10-25); Not applicable, with a reason, where they do not apply.
          { title: 'Password settings', intro: 'Password settings used, complying with AIA IAM standards.' },
        ),
        group('user-management', [
          text('user-id-process', 'User ID request and management process (e.g. via ServiceNow)'),
          multi('mfa-type', 'Type of MFA used', options('Email OTP', 'Mobile OTP', 'Biometrics')),
          number('user-count', 'Number of users (approx.) with access to the application', 'users'),
          number('role-count', 'Number of roles available to the application (e.g. Admin, Super Admin, User)', 'roles'),
          text('role-storage', 'Where roles are stored and defined (e.g. application server, database server)'),
          multi('iam-integration', 'Identity and access management integration', options('SailPoint', 'Okta', 'ForgeRock', 'Active Directory')),
          yesno('least-privilege', 'Accounts are granted on the principle of least privilege and segregation of duties'),
          text('user-management-process', 'User management process defined for the application, including user removal'),
        ]),
        group(
          'privileged',
          [
            table('privileged-accounts', "Privileged accounts of the application (as per the application's privileged roles, e.g. Admin, Super Admin)", [
              column('account', 'Account / role'),
              column('description', 'Description', { optional: true }),
              column('environment', 'Environment', { type: 'choice', options: options('Production', 'UAT', 'DEV') }),
              column('cyberark', 'Managed in CyberArk', { type: 'yesno' }),
            ]),
            yesno('cyberark', 'Privileged accounts are managed via CyberArk'),
            text('privileged-users', 'Users who access the privileged accounts from the application team side (e.g. Production Support, TSS, Kyndryl)'),
          ],
          { title: 'Privileged Identity (PID) Management' },
        ),
        group(
          'service-accounts',
          [
            multi('service-account-usage', 'How service accounts integrate with other applications or components', options('Username & password', 'Managed identity', 'Service principals', 'Keys')),
            text('service-account-location', 'Where service accounts are configured (e.g. application database or server config file)'),
            multi('service-account-management', 'Service accounts are managed via', options('AKV', 'CyberArk', 'IAM operations team')),
          ],
          { title: 'Service Account Management (non-human or non-interactive accounts)' },
        ),
        group(
          'third-party-auth',
          [
            multi('third-party-access', '3rd-party access to the AIA environment', options('AIA VDI', 'VPN', 'AIA laptop', 'None')),
            multi('third-party-environments', 'Environments accessed by the 3rd party', options('DEV', 'SIT', 'UAT', 'PROD'), { showWhen: thirdPartyAccess }),
            multi('third-party-privileges', 'Privileged access of the 3rd party to AIA environments', options('Write', 'Read-only', 'Execute'), { showWhen: thirdPartyAccess }),
          ],
          { title: '3rd Party Authentication' },
        ),
        group(
          'bs-iam',
          [
            yesno(
              'bs-iam',
              'Does the initiative involve an application where user identity and access control are not fully managed by the IT IAM team (e.g. the business provisions, updates and removes user access)?',
            ),
            note('bs-iam-note', 'Submitting a request to IT for tasks like adding or removing a user ID in Active Directory groups does not count as "managed by the IT IAM team".'),
          ],
          { title: 'Business Self-Managed IAM (BS-IAM)' },
        ),
        group(
          'application-security',
          [
            yesno('ci-cd', 'The application is integrated with a CI/CD pipeline'),
            multi('runs-on', 'The application runs on', options('VM', 'Container', 'Microservice')),
            multi('accessed-via', 'The application is accessible via', options('Web', 'Mobile app (iOS/Android)', 'Thick client')),
            text('dev-language', 'Application development language and version (e.g. Java, .NET 7, React Native, PowerApps, low-code/no-code)'),
            yesno('security-scanning', 'Security scanning has been conducted where applicable'),
            table(
              'security-scans',
              'Security scans',
              [
                column('status', 'Status', { type: 'choice', options: options('Done', 'Planned', 'Not applicable') }),
                column('lastDate', 'Last date', { type: 'date', optional: true }),
              ],
              {
                addRows: false,
                fixedRows: [
                  '3rd-party penetration testing',
                  'Veracode SAST & SCA scan',
                  'Qualys DAST & API scan',
                  'Prisma container scan',
                  'Tenable vulnerability scan',
                  'Tenable configuration scan',
                ],
              },
            ),
            yesno('secure-code-review', 'Secure code review has been completed'),
            text('source-code', 'Where the source code is stored (e.g. Bitbucket, GitHub) and how access to the repository is controlled'),
            yesno('env-segregation', 'Production and non-production environments are segregated'),
            yesno('developer-prod-access', 'Developers have access to the production environment'),
            yesno('integrations', 'There are integrations with existing upstream and downstream applications'),
          ],
          { title: 'Application Security' },
        ),
        group(
          'api-security',
          [
            yesno('uses-apis', 'Are any APIs used in the application?'),
            multi('api-auth', 'API authentication mechanism', options('Key based', 'OAuth 2.0'), { showWhen: usesApis }),
            number('api-session-timeout', 'API session timeout', 'minutes', { showWhen: usesApis }),
            yesno('api-refresh-token', 'An API refresh token is implemented', {
              hint: 'There should be an API refresh token along with the access token if the API session timeout is more than 15 minutes.',
              showWhen: usesApis,
              warning: {
                text: 'The API session timeout is more than 15 minutes: there should be an API refresh token along with the access token.',
                when: [
                  { question: 'api-session-timeout', over: 15 },
                  { question: 'api-refresh-token', anyOf: ['no'] },
                ],
              },
            }),
            text('api-traffic', 'How API traffic is managed, and any API rate limits defined', { showWhen: usesApis }),
          ],
          { title: 'API Security' },
        ),
        group(
          'generative-ai',
          [
            yesno('uses-genai', 'Any usage of Generative AI / LLM technology?'),
            yesno('rai-assessment', 'Has it gone through the Responsible Use of AI (RAI) assessment?', { showWhen: usesGenAi }),
            yesno('genai-data-sharing', 'Is AIA data collected for training or storage, or shared with other 3rd parties?', { showWhen: usesGenAi }),
            choice('genai-hosting', 'Physical hosting of the Gen AI / LLM backend', options('Self-hosted', '3rd party'), { showWhen: usesGenAi }),
            choice('genai-tenancy', 'Single-tenant or multi-tenant mode', options('Single-tenant', 'Multi-tenant'), { showWhen: usesGenAi }),
            choice('genai-status', 'Feature status', options('Generally Available (GA)', 'Preview', 'Early Adoption Program (EAP)'), { showWhen: usesGenAi }),
          ],
          { title: 'Generative AI' },
        ),
      ],
    },
    {
      key: 'api-inventory',
      title: 'API Inventory',
      intro:
        'Demonstrates that all APIs are inventoried, classified and centrally tracked: the identification, classification and prioritisation of all API connections and dependencies. One row per API, with its URL in each environment it runs in.',
      references: ['Group Application Programming Interface (API) Standard'],
      groups: [
        group(
          'apis',
          [
            // One row per API (2026-10-25): owners picked or typed, a URL per environment (at least one), data as rows.
            table('apis', 'APIs', [
              column('name', 'API name'),
              column('description', 'API description'),
              column('apiOwner', 'API owner', { type: 'person', personal: true }),
              column('businessOwner', 'Business owner', { type: 'person', personal: true }),
              column('productionUrl', 'Production URL', { optional: true }),
              column('uatUrl', 'UAT URL', { optional: true }),
              column('devUrl', 'DEV URL', { optional: true }),
              column('authMethod', 'Authentication method', { type: 'choice', options: options('Key based', 'OAuth 2.0', 'Other') }),
              column('hosting', 'Hosting location', { type: 'choice', options: options('On-premise', 'Cloud') }),
              column('thirdParty', 'Third-party API', { type: 'yesno' }),
              column('classification', 'Classification', { type: 'choice', options: CLASSIFICATIONS }),
              column('data', 'Data connected to the API', { type: 'dataObjects' }),
              column('dependencies', 'Dependent applications', { type: 'applications', optional: true }),
              column('priority', 'Priority', { type: 'choice', options: options('Critical', 'High', 'Medium', 'Low') }),
              column('justification', 'Priority justification'),
            ], { oneOf: [['productionUrl', 'uatUrl', 'devUrl']], hint: 'Give each API its URL in every environment it runs in: at least one of Production, UAT and DEV.' }),
          ],
          { showWhen: usesApis, intro: 'Shown when the application uses APIs (Security Architecture Design → API Security).' },
        ),
      ],
    },
    {
      key: 'data-protection',
      title: 'Data Protection',
      references: ['ITSR.036 Data Protection Standard', 'ITSR.004 Cryptography Standard', 'ITSR.045 Cloud Security Standard', 'ITSR.016 Network Security Standard'],
      groups: [
        group(
          'classification',
          [
            multi('data-types', 'Type of data transited or stored in the application', options('Customer PII', 'PHI', 'Price-sensitive data')),
            choice('data-classification-level', 'Type of data classification', CLASSIFICATIONS),
          ],
          { title: 'Data Classification' },
        ),
        group(
          'at-rest',
          [
            multi('storage-location', 'Data storage location', options('Azure SQL DB', 'Azure Storage', 'File server')),
            multi('at-rest-encryption', 'Data-at-rest encryption algorithm', options('AES-256', 'TDE', 'RC6')),
            choice('password-hashing', 'Password hashing algorithm', options('SHA-2', 'SHA-1', 'MD5')),
          ],
          { title: 'Data at Rest' },
        ),
        group('in-transit', [multi('in-transit-encryption', 'Data-in-transit encryption algorithm', options('TLS 1.3', 'TLS 1.2', 'SFTP', 'SMBv3'))], {
          title: 'Data in Transit',
        }),
        group(
          'keys',
          [
            choice('key-storage', 'Where data-at-rest encryption keys are stored', options('AIA-managed AKV', 'SaaS vendor-controlled KMS')),
            choice('key-ownership', 'Encryption key ownership and management responsibility', options('AIA', '3rd-party vendor')),
          ],
          { title: 'Encryption Key Management' },
        ),
        group(
          'backups',
          [
            multi('backup-storage', 'Backup data storage location', options('Azure SQL DB', 'Azure Storage', 'File server')),
            multi('backup-encryption', 'Backup data encryption algorithm', options('AES-256', 'TDE', 'RC6')),
            choice('backup-key-ownership', 'Backup data encryption key ownership and management responsibility', options('AIA', '3rd-party vendor')),
            multi('backup-type', 'Type of backup', options('Full', 'Incremental', 'Differential')),
            choice('backup-frequency', 'Backup frequency', options('Daily', 'Weekly', 'Monthly')),
          ],
          { title: 'Data Backups and Encryption Method' },
        ),
      ],
    },
    {
      key: 'security-iam',
      title: 'Security, Identity & Access Management',
      references: [],
      groups: [
        group('controls', [
          table('security-controls', 'Security controls', [column('details', 'Details')], {
            addRows: false,
            fixedRows: ['Authentication', 'Integrity', 'Non-repudiation', 'Confidentiality', 'Hardening'],
          }),
          table('role-permissions', 'Roles and authorised permissions', [column('permission', 'Authorized permission')], {
            fixedRows: ['Application User', 'Developers', 'Readers (Azure Services)', 'Contributors (Azure Services)'],
          }),
        ]),
      ],
    },
    {
      key: 'data-architecture',
      title: 'Data Architecture & Data Flow',
      references: [],
      // Version 2: the data flow view of the solution diagram replaces these.
      retired: [
        retired('data-flow', 'Data flow: the end-to-end flows for service-to-service, end-user-to-service and IT-admin-to-service communications', 2),
        retired('data-modelling', 'Database design and data modelling, including data flow diagrams', 2),
      ],
      groups: [
        group('storage', [
          choice('storage-model', 'Is storage a database on IaaS, or a PaaS service (e.g. Azure SQL DB, Cosmos DB, Storage Account)?', options('IaaS', 'PaaS')),
          text('storage-services', 'Storage services used'),
        ]),
        group('data-flow', [text('data-structure', 'How data is structured, stored and processed')], { diagrams: [diagram('solution', 'data-flow')] }),
      ],
    },
    {
      key: 'deployment',
      title: 'Deployment Architecture',
      references: [],
      groups: [
        group('deployment', [
          text('deployment-environments', 'How the application is deployed across all environments, including the deployment tools'),
          text('publishing-process', 'Deployment and publishing process'),
          text('build-process', 'Build process'),
        ]),
        group(
          'mobile-publishing',
          [text('internal-distribution', 'Publishing to the internal distribution platform'), text('google-play', 'Google Play Store'), text('huawei-appgallery', 'Huawei AppGallery')],
          { title: 'Mobile app publishing', showWhen: { question: 'application-type', anyOf: ['mobile'] } },
        ),
        group(
          'ci-cd',
          [text('ci-process', 'The CI production process'), text('cd-process', 'The CD production process: approval process, deployment notes and required change tasks')],
          { title: 'CI and CD flows', diagrams: [diagram('ci-cd', 'process')] },
        ),
      ],
    },
    {
      key: 'environment',
      title: 'Environment Details',
      intro:
        'Servers, PaaS, SaaS, operating systems, software stacks, EOL/EOS dates and configurations for all environments, including lower environments. Must be in sync with APM > Application Service > Software Model and Configuration Item / Server.',
      references: [],
      groups: [
        group('environment', [
          trm('trm-environment', 'From TRM: application services, servers and software models', 'environment', { fallback: { type: 'none' } }),
          text('environment-other', 'PaaS, SaaS, operating systems, EOL/EOS dates and configurations that ServiceNow does not hold'),
        ]),
      ],
    },
    {
      key: 'logging',
      title: 'Logging & Monitoring',
      references: ['ITSR.034 Security Logging and Monitoring Standard'],
      groups: [
        group(
          'logging',
          [
            text('security-logging', 'How the solution logs and monitors security events for security audit and threat management'),
            multi('log-types', 'Types of logs enabled for this application', options('User authentication logs', 'Application-level logs', 'API logs', 'System logs')),
            text('log-location', 'Where the logs are stored'),
            yesno('siem', 'The logs are monitored by the SIEM solution (SONAR) for malicious activities'),
            text('log-retention', 'Log retention period'),
            links('monitoring-links', 'Monitoring workspace details and dashboard links'),
          ],
          { diagrams: [diagram('monitoring', 'monitoring')] },
        ),
        group(
          'log-questions',
          [
            short('log-q-types', 'General: what is/are the log types? (e.g. system, application, audit, business transaction, financial transaction, security, network logs)'),
            short('log-q-purpose', 'General: what is the purpose of each log type? (e.g. application performance monitoring, audit)'),
            short('log-q-format', 'Log format and structure: what format are the logs in? (e.g. plain text, JSON, XML)'),
            yesno('log-q-production', 'Log format and structure: do the log files exist in Production?'),
            yesno('log-q-uat', 'Log format and structure: do the log files exist in UAT?'),
            short('log-q-storage', 'Log storage and retention: where are the logs stored? (directory / source location)'),
            yesno('log-q-rotation', 'Log storage and retention: is there any log rotation?'),
            short('log-q-retention', 'Log storage and retention: how long is the current log retention? (e.g. 1 year, 2 years, 3 years)'),
          ],
          { title: 'Log questions' },
        ),
      ],
    },
    {
      key: 'backup',
      title: 'Backup Details and Architecture',
      references: ['Group Business Continuity Management Standard', 'ITSR.004 Cryptography Standard'],
      groups: [
        group('backup', [
          text('backup-description', 'How the application is backed up: backup schedules, storage solutions, backup encryption and restoration procedures'),
          table('backup-frequency-table', 'Backup type and frequency', [column('frequency', 'Frequency')], {
            addRows: false,
            fixedRows: ['Full backup', 'Incremental backup', 'Log backup'],
          }),
        ]),
        group('business-requirements', [text('business-requirements', 'Custom business requirements, if any')], { title: 'Business requirements' }),
        group(
          'regulation',
          [
            multi('regulation-requirements', 'Regulation requirements that apply', [
              {
                value: 'financial-transaction',
                label: 'Financial Transaction',
                description:
                  'Records monetary transactions affecting the financial statements, for accurate financial reporting and compliance with accounting standards. This is the financial record of the transaction, not the middle-service record (not the API query related to it). Stored in a database. Requires 8-year retention.',
              },
              {
                value: 'business-transaction',
                label: 'Business Transaction',
                description:
                  'Records interactions with customers, suppliers or other stakeholders that track operational activities and processes. This is the actual record of the transaction (e.g. a beneficiary change), not the middle-service record. Stored in a database. Requires 3-year retention.',
              },
            ]),
          ],
          { title: 'Regulation requirements', intro: 'Align regulation requirements on the retention of data impacting backup. Tick the items that apply.' },
        ),
        group(
          'schedule',
          [
            note('schedule-resources', 'Fill in the resource name (cloud or on-premise) only for the resources directly owned by this application.'),
            note('schedule-values', 'Do not change any of the retention values. If a retention does not meet business requirements, raise a request to the Infrastructure team for alignment.'),
            note('schedule-production', 'Only required for production systems: non-production has standard retention.'),
            note(
              'schedule-validate',
              'Refer to the Backup Retention guideline for on-premises if required. Once completed, validate the setup with the Infrastructure team and email them to configure the backup as required.',
            ),
            { type: 'retention', key: 'backup-schedule', label: 'Cloud services backup schedule' },
          ],
          { title: 'Backup schedule' },
        ),
      ],
    },
  ],
};
