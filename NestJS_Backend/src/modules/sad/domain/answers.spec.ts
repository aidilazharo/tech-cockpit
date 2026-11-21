import { describe, expect, it } from 'vitest';
import { currentAnswers, sectionAnswersSchema, settleRefs, shownAnswers } from './answers.js';
import type { Section } from './template-types.js';
import { plainText, RichDocSchema } from './rich-text.js';
import { SAD_TEMPLATE } from './template.js';
import type { SadSectionKey } from './sections.js';

const PERSON = '00000000-0000-4000-8000-000000000001';
const APP = '80000000-0000-4000-8000-000000000001';
const STANDARD = '90000000-0000-4000-8000-000000000001';
const section = (key: SadSectionKey) => SAD_TEMPLATE.sections.find((s) => s.key === key)!;
const parse = (key: SadSectionKey, answers: unknown) => sectionAnswersSchema(section(key)).safeParse(answers);
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const words = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });

describe('rich text', () => {
  it('keeps paragraphs, lists, bold, italic and safe links, dropping editor-only attributes', () => {
    const value = doc(
      para(words('Front Door', [{ type: 'bold' }]), { type: 'hardBreak' }, words('see ', [{ type: 'italic' }]), words('docs', [{ type: 'link', attrs: { href: 'https://aia.com', target: '_blank', rel: 'noopener', class: null } }])),
      { type: 'bulletList', content: [{ type: 'listItem', content: [para(words('one'))] }] },
      { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [para(words('two'))] }] },
      { type: 'paragraph' },
    );
    const parsed = RichDocSchema.parse(value);
    expect(JSON.stringify(parsed)).not.toContain('noopener');
    expect(plainText(parsed)).toBe('Front Door\nsee docs\none\ntwo');
  });

  it('keeps headings, underline, strikethrough, font sizes and tables (2026-10-25)', () => {
    const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [para(words(text))] });
    const value = doc(
      { type: 'heading', attrs: { level: 4, textAlign: null }, content: [words('Overview')] },
      { type: 'heading', attrs: { level: 5 }, content: [words('Front end')] },
      para(words('under', [{ type: 'underline' }]), words(' struck', [{ type: 'strike' }]), words(' small', [{ type: 'textStyle', attrs: { fontSize: 'small', color: null } }]), words(' large', [{ type: 'textStyle', attrs: { fontSize: 'large' } }])),
      { type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', 'Service'), cell('tableHeader', 'Tier')] }, { type: 'tableRow', content: [cell('tableCell', 'App Service'), cell('tableCell', 'P1v3')] }] },
    );
    const parsed = RichDocSchema.parse(value);
    expect(JSON.stringify(parsed)).not.toContain('colwidth');
    expect(JSON.stringify(parsed)).not.toContain('textAlign');
    expect(plainText(parsed)).toBe('Overview\nFront end\nunder struck small large\nService\nTier\nApp Service\nP1v3');
  });

  it.each([
    ['a top-level heading', doc({ type: 'heading', attrs: { level: 1 }, content: [words('x')] })],
    ['a font size not offered', doc(para(words('x', [{ type: 'textStyle', attrs: { fontSize: '72px' } }])))],
    ['a list inside a table cell', doc({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'bulletList', content: [] }] }] }] })],
    ['a table inside a list', doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'table', content: [] }] }] })],
    ['a script link', doc(para(words('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])))],
    ['an unknown mark', doc(para(words('x', [{ type: 'code' }])))],
    ['too deep nesting', doc(Array.from({ length: 40 }).reduce<unknown>((inner) => ({ type: 'bulletList', content: [{ type: 'listItem', content: [inner] }] }), para(words('x'))))],
  ])('refuses %s', (_, value) => {
    expect(RichDocSchema.safeParse(value).success).toBe(false);
  });
});

describe('section answers', () => {
  it('needs a label on every row of a table with fixed rows', () => {
    expect(parse('security-iam', { 'role-permissions': { value: [{ cells: { permission: 'Read' } }] } }).success).toBe(false);
  });

  it('accepts no value in a choice column that has no options', () => {
    const table: Section = {
      key: 'security-iam',
      title: 'T',
      references: [],
      groups: [{ key: 'g', items: [{ type: 'table', key: 't', label: 'T', addRows: true, columns: [{ key: 'c', label: 'C', type: 'choice' }] }] }],
    };
    expect(sectionAnswersSchema(table).safeParse({ t: { value: [{ cells: { c: 'anything' } }] } }).success).toBe(false);
    expect(sectionAnswersSchema(table).safeParse({ t: { value: [{ cells: {} }] } }).success).toBe(true);
  });

  it('accepts every answer shape the template uses', () => {
    expect(
      parse('solution-integration', {
        'solution-overview': { value: doc(para(words('Azure App Service'))) },
        'hosting-location': { value: { selected: ['aia-azure', 'other'], other: 'Colo' } },
        accessibility: { notApplicable: true, reason: 'Batch only' },
        'vm-check-in': { value: { answer: 'yes', details: 'Standard agents' } },
        'base-image': { value: doc(para(words('AIA approved image'))) },
      }).success,
    ).toBe(true);
    expect(
      parse('security-design', {
        'acacm-link': { value: [{ label: 'ACACM', url: 'https://sharepoint.aia.com/acacm' }] },
        'authentication-method': { value: { selected: 'okta-sso' } },
        'user-count': { value: 1200 },
        'security-scans': { value: [{ row: 'Veracode SAST & SCA scan', cells: { status: 'done', lastDate: '2026-09-30' } }] },
        'privileged-accounts': { value: [{ id: '70000000-0000-4000-8000-000000000001', cells: { account: 'Super Admin' } }] },
      }).success,
    ).toBe(true);
    expect(
      parse('api-inventory', {
        apis: {
          value: [
            {
              cells: {
                name: 'Policy API',
                apiOwner: { id: PERSON, name: 'Ada Admin' },
                productionUrl: 'https://api.aia.com/policy',
                thirdParty: 'no',
                classification: 'confidential',
                dependencies: { items: [{ id: APP, name: 'CRM' }], other: 'Mainframe' },
                priority: 'critical',
              },
            },
          ],
        },
      }).success,
    ).toBe(true);
    // API owners picked or typed; data connected as rows of data object and key attributes; a URL per environment.
    expect(
      parse('api-inventory', {
        apis: { value: [{ cells: { name: 'Claims API', apiOwner: { name: 'Vendor support desk' }, productionUrl: 'https://api.aia.com/claims', data: [{ object: 'Claim', attributes: 'claim number, amount' }] } }] },
      }).success,
    ).toBe(true);
    expect(parse('security-iam', { 'role-permissions': { value: [{ row: 'Developers', cells: { permission: 'Read' } }, { row: 'Auditors', cells: { permission: 'Read logs' } }] } }).success).toBe(true);
    expect(parse('backup', { 'backup-schedule': { value: { rows: [{ standardId: STANDARD, resourceName: 'sql-prod-01' }] } } }).success).toBe(true);
    expect(parse('application-details', { 'data-classification': { value: { selected: 'confidential' } }, 'supporting-entity': { value: 'AIA Bhd' } }).success).toBe(true);
  });

  it.each([
    ['an unknown question', 'solution-integration', { nope: { value: 'x' } }],
    ['a question from another section', 'solution-integration', { 'user-count': { value: 1 } }],
    ['a choice the question does not offer', 'security-design', { 'authentication-method': { value: { selected: 'kerberos' } } }],
    ['"other" in a table column (their lists are fixed)', 'security-design', { 'security-scans': { value: [{ row: 'Veracode SAST & SCA scan', cells: { status: 'other' } }] } }],
    ['a script link', 'security-design', { 'acacm-link': { value: [{ url: 'javascript:alert(1)' }] } }],
    ['not applicable without a reason', 'solution-integration', { accessibility: { notApplicable: true, reason: ' ' } }],
    ['not applicable where it must be answered', 'security-design', { 'local-auth-justification': { notApplicable: true, reason: 'Legacy' } }],
    ['a negative number', 'security-design', { 'user-count': { value: -1 } }],
    ['an unknown table column', 'security-design', { 'privileged-accounts': { value: [{ cells: { password: 'x' } }] } }],
    ['an unknown fixed row', 'security-design', { 'security-scans': { value: [{ row: 'Made-up scan', cells: { status: 'done' } }] } }],
    ['a row label in a table without fixed rows', 'security-design', { 'privileged-accounts': { value: [{ row: 'x', cells: { account: 'a' } }] } }],
    ['a person that is not a user id', 'api-inventory', { apis: { value: [{ cells: { apiOwner: { id: 'ada', name: 'Ada' } } }] } }],
    ['a typed person without a name', 'api-inventory', { apis: { value: [{ cells: { apiOwner: { name: ' ' } } }] } }],
    ['a data row with an unknown field', 'api-inventory', { apis: { value: [{ cells: { data: [{ object: 'Policy', attributes: 'x', owner: 'y' }] } }] } }],
    ['the dropped single URL', 'api-inventory', { apis: { value: [{ cells: { url: 'https://api.aia.com' } }] } }],
    ['an answer to a TRM value that cannot be overridden', 'application-details', { 'app-name': { value: 'Renamed' } }],
    ['a repeated retention row', 'backup', { 'backup-schedule': { value: { rows: [{ standardId: STANDARD, resourceName: 'a' }, { standardId: STANDARD, resourceName: 'b' }] } } }],
  ])('refuses %s', (_, key, answers) => {
    expect(parse(key as SadSectionKey, answers).success).toBe(false);
  });
});

describe('answers to questions the template no longer asks', () => {
  it('are left out, so an older draft can still be shown and saved', () => {
    const answers = { 'solution-overview': { value: doc(para(words('Azure'))) }, 'solution-diagram': { value: doc(para(words('old picture'))) }, 'communication-matrix': { notApplicable: true as const, reason: 'x' } };
    expect(Object.keys(currentAnswers(section('solution-integration'), answers))).toEqual(['solution-overview']);
  });
});

describe('people and applications named in tables', () => {
  const section = SAD_TEMPLATE.sections.find((s) => s.key === 'api-inventory')!;
  const person = (id: string, name: string) => ({ id, name });
  const answers = {
    apis: {
      value: [
        { id: 'r1', cells: { name: 'Policy API', apiOwner: person('u1', 'Typed by the browser'), dependencies: { items: [person('a1', 'Billing?')], other: 'Mainframe' } } },
        { id: 'r2', cells: { name: 'Claims API', businessOwner: { name: 'Typed team' } } },
      ],
    },
  };

  it('are each replaced by what the check returns, with where they are named', () => {
    const seen: string[] = [];
    const settled = settleRefs(section, answers, (ref, kind, where) => {
      seen.push(`${kind} ${ref.id} (${where})`);
      return { id: ref.id, name: `${ref.id} from its source` };
    });
    expect(seen).toEqual(['person u1 (API owner in APIs)', 'application a1 (Dependent applications in APIs)']);
    expect(settled.apis).toEqual({
      value: [
        { id: 'r1', cells: { name: 'Policy API', apiOwner: person('u1', 'u1 from its source'), dependencies: { items: [person('a1', 'a1 from its source')], other: 'Mainframe' } } },
        // A typed name is kept as typed: there is nothing to check it against.
        { id: 'r2', cells: { name: 'Claims API', businessOwner: { name: 'Typed team' } } },
      ],
    });
  });

  it('leave answers without tables, and tables that do not apply, as they are', () => {
    const notApplicable = { apis: { notApplicable: true as const, reason: 'No APIs' } };
    expect(settleRefs(section, notApplicable, () => { throw new Error('not called'); })).toEqual(notApplicable);
    expect(settleRefs(section, {}, () => { throw new Error('not called'); })).toEqual({});
    const other = SAD_TEMPLATE.sections.find((s) => s.key === 'resiliency')!;
    expect(settleRefs(other, { 'dr-plan': { value: 'x' } }, () => { throw new Error('not called'); })).toEqual({ 'dr-plan': { value: 'x' } });
  });
});

describe('the answers a version shows', () => {
  const solution = section('solution-integration');
  const stored = {
    'solution-overview': { value: doc(para(words('Front Door'))) },
    'communication-matrix': { value: doc(para(words('Web to API on 443'))) },
    'never-asked': { value: 'x' },
  };

  it('are the questions the template asks, for drafts and versions in approval', () => {
    expect(Object.keys(shownAnswers(solution, stored, false))).toEqual(['solution-overview']);
  });

  it('leave out, for drafts, answers that no longer fit their question (the template changed its type); approved versions keep them', () => {
    const oneLine = { 'base-image': { value: 'AIA approved image' }, 'container-orchestration': { notApplicable: true as const, reason: 'No containers' } };
    expect(shownAnswers(solution, oneLine, false)).toEqual({ 'container-orchestration': { notApplicable: true, reason: 'No containers' } });
    expect(shownAnswers(solution, oneLine, true)).toEqual(oneLine);
    // A TRM value is never answered in the SAD.
    expect(currentAnswers(section('application-details'), { 'app-name': { value: 'Renamed' } })).toEqual({});
  });

  it('keep answers to questions later templates removed, for approved and superseded versions', () => {
    expect(Object.keys(shownAnswers(solution, stored, true))).toEqual(['solution-overview', 'communication-matrix']);
    expect(Object.keys(shownAnswers(section('backup'), { 'never-asked': { value: 'x' } }, true))).toEqual([]);
  });
});
