import { describe, expect, it } from 'vitest';
import type { Content } from 'pdfmake/interfaces.js';
import { buildSadPdf, displayDate, malaysiaDate, pdfHistory, type PdfVersion } from './sad-pdf.js';
import type { PdfDiagrams } from './sad-pdf-diagrams.js';

const STANDARD = '90000000-0000-4000-8000-000000000001';
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Front Door', marks: [{ type: 'bold' }, { type: 'italic' }] }, { type: 'hardBreak' }, { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://aia.com' } }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
    { type: 'orderedList', attrs: { start: 2 }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
    { type: 'orderedList', content: [] },
  ],
};

function version(overrides: Partial<PdfVersion> = {}): PdfVersion {
  return {
    application: { name: 'CRM', number: 'APM-1' },
    status: 'current',
    number: 2,
    draftOf: null,
    trm: {
      values: {
        name: 'CRM',
        number: 'APM-1',
        portfolios: ['Group', 'Retail'],
        dataClassification: null,
        environment: [
          { name: 'CRM Prod', environment: 'Production', servers: ['srv-1'], software: [{ name: 'PostgreSQL', version: '15', standard: 'PostgreSQL', standardStatus: 'Standard' }, { name: 'Nginx', version: null, standard: null, standardStatus: null }] },
          { name: null, environment: null, servers: [], software: [] },
        ],
      },
      restricted: ['businessOwner'],
    },
    sections: [
      {
        key: 'application-details',
        readable: true,
        answers: { 'data-classification': { value: { selected: 'confidential' } }, 'supporting-entity': { value: 'AIA Bhd' }, 'external-internal': { notApplicable: true, reason: 'Internal tool' } },
      },
      {
        key: 'solution-integration',
        readable: true,
        answers: {
          'solution-overview': { value: doc },
          'hosting-location': { value: { selected: ['aia-azure', 'other'], other: 'Colo' } },
          'vm-check-in': { value: { answer: 'yes', details: 'Agents' } },
          'base-image': { value: 'AIA image' },
          'ecc-pcc': { value: { answer: 'no' } },
          accessibility: { value: { selected: [] } },
        },
      },
      {
        key: 'security-design',
        readable: true,
        answers: {
          'acacm-link': { value: [{ label: 'ACACM', url: 'https://aia.com/acacm' }, { url: 'https://aia.com/b' }] },
          'user-count': { value: 1200 },
          'security-scans': { value: [{ row: 'Veracode SAST & SCA scan', cells: { status: 'done', lastDate: '2026-09-30' } }, { row: 'Prisma container scan', cells: { status: 'unknown-value' } }] },
          'privileged-accounts': { value: [] },
        },
      },
      {
        key: 'api-inventory',
        readable: true,
        answers: {
          apis: {
            value: [
              {
                cells: {
                  name: 'Policy API',
                  apiOwner: { id: 'x', name: 'Ada' },
                  thirdParty: 'no',
                  number: 3,
                  dependencies: { items: [{ id: 'y', name: 'Billing' }], other: 'Mainframe' },
                  priority: 'critical',
                  description: '',
                },
              },
            ],
          },
        },
      },
      { key: 'network', readable: false, answers: null },
      { key: 'backup', readable: true, answers: { 'backup-schedule': { value: { rows: [{ standardId: STANDARD, resourceName: 'sql-01', comment: 'Prod' }, { standardId: 'missing', resourceName: 'x' }] } } } },
      { key: 'security-iam', readable: true, answers: {} },
      { key: 'environment', readable: true, answers: {} },
    ],
    hidden: ['tpsa', 'ip-whitelisting', 'csp-certifications', 'vulnerability-management', 'system-hardening', 'patch-management', 'data-segregation', 'security-agents'],
    ...overrides,
  };
}

const flat = (value: unknown): string => JSON.stringify(value);
const retention = [{ id: STANDARD, serviceType: 'Database - MsSQL on VM', dataType: 'Financial Transaction', yearly: '8 Years', monthly: '12 months', weekly: '5 weeks', daily: '7 days', comment: null }];

describe('SAD PDF', () => {
  it('lays out the AIA template: details, version control, then every readable section with its answers', () => {
    const pdf = buildSadPdf(version(), [{ user: 'Ada', action: 'Submitted', state: 'In approval', comment: '', date: '30/09/2026', version: '2' }], retention, new Date('2026-10-22T16:30:00Z'));
    const text = flat(pdf.content);
    expect(text).toContain('SOLUTION ARCHITECTURE DOCUMENT');
    expect(text).toContain('Approved (current version)');
    expect(text).toContain('Submitted');
    // Answers of every type
    expect(text).toContain('Confidential'); // TRM fallback choice
    expect(text).toContain('AIA Bhd');
    expect(text).toContain('Internal tool'); // not applicable
    expect(text).toContain('Front Door');
    expect(text).toContain('AIA Azure, Other: Colo');
    expect(text).toContain('AIA image');
    expect(text).toContain('1200 users');
    expect(text).toContain('30/09/2026');
    expect(text).toContain('https://aia.com/acacm');
    expect(text).toContain('Billing, Mainframe');
    expect(text).toContain('Ada');
    expect(text).toContain('sql-01');
    expect(text).toContain('8 Years');
    expect(text).toContain('Group, Retail');
    expect(text).toContain('CRM Prod');
    expect(text).toContain('PostgreSQL 15 (PostgreSQL: Standard)');
    expect(text).toContain('Restricted'); // a name the reader may not see
    expect(text).toContain('[To be completed]');
    // Hidden questions and restricted sections stay out, and the reader is told which sections.
    expect(text).not.toContain('TPM / TPSA');
    expect(text).toContain('Sections not included');
    expect(text).toContain('Physical and Network Architecture');
    expect(pdf.watermark).toBeUndefined();
    const footer = (pdf.footer as (page: number, pages: number) => { columns: { text: string }[] })(1, 3);
    expect(footer.columns.map((c) => c.text)).toEqual(['Generated 23/10/2026 from AIA TechCockpit', 'Page 1 of 3']);
  });

  it('shows "Other" without text, and a software standard without a status', () => {
    const base = version();
    const sections = base.sections.map((s) => (s.key === 'solution-integration' ? { ...s, answers: { 'hosting-location': { value: { selected: ['other'] } } } } : s));
    const environment = [{ name: 'CRM Test', environment: 'Test', servers: [], software: [{ name: 'Redis', version: '7', standard: 'Redis', standardStatus: null }] }];
    const text = flat(buildSadPdf(version({ sections, trm: { ...base.trm!, values: { ...base.trm!.values, environment } } }), [], retention, new Date()).content);
    expect(text).toContain('Other: ');
    expect(text).toContain('Redis 7 (Redis)');
  });

  it('marks drafts, names the draft number, and handles a version with no TRM access or history', () => {
    const pdf = buildSadPdf(version({ status: 'draft', number: null, draftOf: 3, trm: null, application: { name: null, number: null } }), [], [], new Date());
    const text = flat(pdf.content);
    expect(text).toContain('Draft of version 3');
    expect(text).toContain('TRM has no application services');
    expect(pdf.watermark).toMatchObject({ text: 'DRAFT' });
    expect(pdf.info?.title).toBe('SAD - application');
    expect(flat(buildSadPdf(version({ status: 'superseded', draftOf: null, number: null }), [], [], new Date()).content)).toContain('Draft of version 1');
  });

  it('formats dates as DD/MM/YYYY, in Malaysia time for moments', () => {
    expect(displayDate('2026-01-05')).toBe('05/01/2026');
    expect(malaysiaDate(new Date('2026-12-31T17:00:00Z'))).toBe('01/01/2027');
  });

  it('puts each diagram on its own landscape page after its group, and turns back to portrait for what follows', () => {
    const page = (id: string) => ({ id, title: id, sizing: 'auto' as const, zones: [], boxes: [{ id: 'b', label: 'Web', type: 'part', icon: 'app-services', x: 0, y: 0 }], lines: [] });
    const diagrams: PdfDiagrams = {
      slots: [
        { slot: 'solution', owner: 'solution-integration', readableViews: ['solution'], content: { diagrams: [page('solution')] } },
        { slot: 'monitoring', owner: 'logging', readableViews: ['monitoring'], content: { notApplicable: true, reason: 'Batch job' } },
      ],
      apis: [],
      uploads: [],
    };
    const sections = [
      { key: 'solution-integration', readable: true, answers: {} },
      { key: 'logging', readable: true, answers: {} },
    ];
    const pdf = buildSadPdf(version({ sections, hidden: [] }), [], [], new Date(), diagrams);
    const content = pdf.content as Content[];
    const turns = content.flatMap((item, index) => {
      const { pageOrientation, stack } = item as { pageOrientation?: string; stack?: { text?: string }[] };
      return pageOrientation ? [[index, pageOrientation, stack![0].text]] : [];
    });
    expect(turns.map(([, orientation, first]) => [orientation, first])).toEqual([
      ['landscape', 'Solution diagram'],
      // The next group of section 2 starts a portrait page again.
      ['portrait', 'Application hosted in AIA Azure and PDC/SDC'],
    ]);
    expect(flat(content)).toContain('<svg x=');
    expect(flat(content)).toContain('app-services-');
    // Section 2's text questions come before the drawing; the Integration view is left out without the slot.
    const solutionAt = content.findIndex((item) => (item as { text?: string }).text === 'Solution & Integration Architecture');
    expect(solutionAt).toBeLessThan(turns[0][0] as number);
    expect(flat(content)).not.toContain('Integration view');
    // Not applicable stays in the section's flow.
    expect(flat(content)).toContain('Does not apply: Batch job');
    expect(pdf.styles).toMatchObject({ h3: { bold: true }, caption: { bold: true } });
  });

  it('turns back to portrait for the list of sections left out when the last section ends with a diagram', () => {
    const diagrams: PdfDiagrams = {
      slots: [{ slot: 'monitoring', owner: 'logging', readableViews: ['monitoring'], content: { diagrams: [{ id: 'm', title: 'Alerts', sizing: 'auto', zones: [], boxes: [], lines: [] }] } }],
      apis: [],
      uploads: [],
    };
    const content = buildSadPdf(version({ sections: [{ key: 'logging', readable: true, answers: {} }, { key: 'backup', readable: false, answers: null }], hidden: [] }), [], [], new Date(), diagrams).content as Content[];
    const orientations = content.flatMap((item) => ((item as { pageOrientation?: string }).pageOrientation ? [(item as { pageOrientation: string }).pageOrientation] : []));
    expect(orientations).toEqual(['landscape', 'portrait']);
  });
});

describe('API rows in the PDF', () => {
  it('prints typed owners as typed, and each data object with its key attributes', () => {
    const row = { cells: { name: 'Claims API', apiOwner: { name: 'Vendor support desk' }, productionUrl: 'https://api.aia.com/claims', data: [{ object: 'Claim', attributes: 'claim number, amount' }, { object: 'Policy', attributes: 'policy number' }] } };
    const sections = version().sections.map((s) => (s.key === 'api-inventory' ? { ...s, answers: { apis: { value: [row] } } } : s));
    const text = flat(buildSadPdf(version({ sections, hidden: [] }), [], retention, new Date('2026-10-22T16:30:00Z')).content);
    expect(text).toContain('Vendor support desk');
    expect(text).toContain('https://api.aia.com/claims');
    expect(text).toContain('Claim: claim number, amount\\nPolicy: policy number');
  });
});

describe('rich text in the PDF', () => {
  it('prints headings, underline, strikethrough, font sizes and tables as the editor shows them', () => {
    const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({ type, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    const rich = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Overview' }] },
        { type: 'heading', attrs: { level: 5 }, content: [{ type: 'text', text: 'Front end' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'under', marks: [{ type: 'underline' }] },
            { type: 'text', text: 'struck', marks: [{ type: 'strike' }, { type: 'underline' }] },
            { type: 'text', text: 'small', marks: [{ type: 'textStyle', attrs: { fontSize: 'small' } }] },
            { type: 'text', text: 'large', marks: [{ type: 'textStyle', attrs: { fontSize: 'large' } }] },
          ],
        },
        { type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', 'Service'), cell('tableHeader', 'Tier')] }, { type: 'tableRow', content: [cell('tableCell', 'App Service'), cell('tableCell', 'P1v3')] }] },
      ],
    };
    const sections = version().sections.map((s) => (s.key === 'solution-integration' ? { ...s, answers: { 'solution-overview': { value: rich } } } : s));
    const text = flat(buildSadPdf(version({ sections }), [], retention, new Date('2026-10-22T16:30:00Z')).content);
    expect(text).toContain('{"text":[{"text":"Overview"}],"bold":true,"fontSize":12');
    expect(text).toContain('{"text":[{"text":"Front end"}],"bold":true,"fontSize":11');
    expect(text).toContain('{"text":"under","decoration":["underline"]}');
    expect(text).toContain('{"text":"struck","decoration":["underline","lineThrough"]}');
    expect(text).toContain('{"text":"small","fontSize":8}');
    expect(text).toContain('{"text":"large","fontSize":12}');
    expect(text).toContain('"body":[[{"stack":[{"text":[{"text":"Service"}]');
    expect(text).toContain('"bold":true');
  });
});

describe('local authentication in the Document Details', () => {
  it('is shown when section 5 says so, to its readers (the view says null to others)', () => {
    const details = (flag: boolean | null) => flat((buildSadPdf(version({ localAuthentication: flag }), [], retention, new Date('2026-10-22T16:30:00Z')).content as Content[]).slice(0, 4));
    expect(details(true)).toContain('Local authentication');
    expect(details(true)).toContain('Yes: the application does its own authentication (see Security Architecture Design)');
    expect(details(false)).not.toContain('Local authentication');
    expect(details(null)).not.toContain('Local authentication');
  });
});

describe('questions asked once that the template has in two places', () => {
  const DEPLOYED = 'How the application is deployed across all environments, including the deployment tools';
  const withAnswers = (deploymentReadable: boolean) =>
    version().sections.map((s) =>
      s.key === 'security-design' ? { ...s, answers: { ...s.answers, 'password-session-timeout': { value: 30 } } } : s,
    ).concat([{ key: 'deployment', readable: deploymentReadable, answers: deploymentReadable ? { 'deployment-environments': { value: doc } } : null }]);
  const count = (text: string, part: string) => text.split(part).length - 1;

  it('print the answer in both places: the session timeout in Application Security, the deployment question there too', () => {
    const text = flat(buildSadPdf(version({ sections: withAnswers(true) }), [], retention, new Date('2026-10-22T16:30:00Z')).content);
    expect(count(text, DEPLOYED)).toBe(2);
    expect(text).toContain('Session timeout of the application');
    expect(text).toContain('30 minutes');
  });

  it("print the deployment answer only for readers of section 10", () => {
    const text = flat(buildSadPdf(version({ sections: withAnswers(false) }), [], retention, new Date('2026-10-22T16:30:00Z')).content);
    expect(count(text, DEPLOYED)).toBe(0);
    expect(text).toContain('Session timeout of the application');
    // Nor where the question does not apply.
    const hiddenThere = flat(buildSadPdf(version({ sections: withAnswers(true), hidden: [...version().hidden, 'deployment-environments'] }), [], retention, new Date('2026-10-22T16:30:00Z')).content);
    expect(count(hiddenThere, DEPLOYED)).toBe(0);
  });
});

describe('answers to questions later templates removed', () => {
  it('are printed in their section after its questions, marked "No longer asked"', () => {
    const sections = version().sections.map((s) => (s.key === 'solution-integration' ? { ...s, answers: { ...s.answers, 'communication-matrix': { value: doc } } } : s));
    const text = flat(buildSadPdf(version({ sections }), [], retention, new Date('2026-10-22T16:30:00Z')).content);
    expect(text).toContain('Source and destination communication matrix');
    expect(text).toContain('No longer asked');
    expect(text.indexOf('No longer asked')).toBeLessThan(text.indexOf('Physical and Network Architecture'));
    expect(flat(buildSadPdf(version(), [], retention, new Date('2026-10-22T16:30:00Z')).content)).not.toContain('No longer asked');
  });
});

describe('the Version Control rows in the PDF', () => {
  it('words each action, with the step as the state of decisions, questions and answers, and dates in Malaysia time', () => {
    const at = new Date('2026-10-24T17:30:00Z');
    const row = (action: Parameters<typeof pdfHistory>[0][number]['action'], step: string | null = null, user: string | null = 'Ada', comment: string | null = null) => ({ action, user, step, comment, at });
    expect(
      pdfHistory(
        [
          row('started'),
          row('submitted'),
          row('withdrawn'),
          row('info_requested', 'Application manager', 'Max', 'Which region?'),
          row('answered', 'Application manager', 'Ada', 'Malaysia West'),
          row('approved', 'Application manager', 'Max'),
          row('returned', 'Solution architect', 'Restricted', 'Add the DR test date'),
          row('resubmitted'),
          row('version_approved', null, null),
        ],
        '3',
      ).map((r) => [r.user, r.action, r.state, r.comment, r.date, r.version]),
    ).toEqual([
      ['Ada', 'Started draft', 'Draft', '', '25/10/2026', '3'],
      ['Ada', 'Submitted', 'In approval', '', '25/10/2026', '3'],
      ['Ada', 'Withdrawn', 'Draft', '', '25/10/2026', '3'],
      ['Max', 'Asked for information', 'Application manager', 'Which region?', '25/10/2026', '3'],
      ['Ada', 'Answered', 'Application manager', 'Malaysia West', '25/10/2026', '3'],
      ['Max', 'Approved', 'Application manager', '', '25/10/2026', '3'],
      ['Restricted', 'Returned', 'Solution architect', 'Add the DR test date', '25/10/2026', '3'],
      ['Ada', 'Resubmitted', 'In approval', '', '25/10/2026', '3'],
      ['', 'Version approved', 'Current', '', '25/10/2026', '3'],
    ]);
  });
});
