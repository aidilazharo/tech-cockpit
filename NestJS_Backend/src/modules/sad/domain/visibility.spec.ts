import { describe, expect, it } from 'vitest';
import { SAD_TEMPLATE } from './template.js';
import type { SadTemplate } from './template-types.js';
import { evaluate, type SadDiagrams } from './visibility.js';

const STANDARD = '90000000-0000-4000-8000-000000000001';
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] });

// A small template exercising every rule.
const mini: SadTemplate = {
  version: 1,
  sections: [
    {
      key: 'solution-integration',
      title: 'S',
      references: [],
      groups: [
        {
          key: 'g1',
          items: [
            { type: 'multi', key: 'hosting', label: 'Hosting', options: [{ value: 'azure', label: 'Azure' }, { value: 'saas', label: 'SaaS' }, { value: 'none', label: 'None' }], other: true },
            { type: 'yesno', key: 'apis', label: 'APIs?', showWhen: { question: 'hosting', anyOf: ['azure'] } },
            { type: 'text', key: 'api-notes', label: 'Notes', showWhen: { question: 'apis', anyOf: ['yes'] } },
            { type: 'note', key: 'n', text: 'Guidance' },
          ],
        },
        { key: 'g2', showWhen: { question: 'hosting', anyExcept: ['none'] }, items: [{ type: 'short', key: 'detail', label: 'Detail' }] },
        {
          key: 'g3',
          items: [
            { type: 'table', key: 'fixed', label: 'Fixed', addRows: false, fixedRows: ['A', 'B'], columns: [{ key: 'x', label: 'X', type: 'text' }, { key: 'y', label: 'Y', type: 'date', optional: true }] },
            { type: 'table', key: 'rows', label: 'Rows', addRows: true, columns: [{ key: 'x', label: 'X', type: 'text' }] },
            { type: 'choice', key: 'pick', label: 'Pick', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], other: true },
            { type: 'retention', key: 'retention', label: 'Retention' },
            { type: 'trm', key: 'owner', label: 'Owner', source: 'businessOwner' },
            { type: 'trm', key: 'servers', label: 'Servers', source: 'environment', fallback: { type: 'none' } },
          ],
        },
      ],
    },
  ],
};

const only = (result: ReturnType<typeof evaluate>) => result.sections[0];

describe('visibility', () => {
  it('hides a conditional question until the answer it depends on matches, and follows chains', () => {
    expect([...evaluate(mini, {}, {}).hidden].sort()).toEqual(['api-notes', 'apis', 'detail']);
    const azure = evaluate(mini, { 'solution-integration': { hosting: { value: { selected: ['azure'] } }, apis: { value: { answer: 'yes' } } } }, {});
    expect(azure.hidden.size).toBe(0);
    // SaaS only: "apis" hides, so the question depending on it hides too, whatever was answered.
    const saas = evaluate(mini, { 'solution-integration': { hosting: { value: { selected: ['saas'] } }, apis: { value: { answer: 'yes' } } } }, {});
    expect([...saas.hidden].sort()).toEqual(['api-notes', 'apis']);
  });

  it('follows a single-choice answer, and hides a question that depends on one not in the template', () => {
    const extended: SadTemplate = {
      ...mini,
      sections: [
        {
          ...mini.sections[0],
          groups: [
            ...mini.sections[0].groups,
            { key: 'g4', showWhen: { question: 'pick', anyOf: ['a'] }, items: [{ type: 'short', key: 'when-a', label: 'When A' }] },
            { key: 'g5', showWhen: { question: 'missing', anyOf: ['x'] }, items: [{ type: 'short', key: 'never', label: 'Never' }] },
            // A condition on a free-text answer never matches: only choices and yes/no can be tested.
            { key: 'g6', showWhen: { question: 'detail', anyOf: ['x'] }, items: [{ type: 'short', key: 'on-text', label: 'On text' }] },
          ],
        },
      ],
    };
    const picked = evaluate(extended, { 'solution-integration': { hosting: { value: { selected: ['saas'] } }, detail: { value: 'x' }, pick: { value: { selected: 'a' } } } }, {});
    expect(picked.hidden.has('when-a')).toBe(false);
    expect(picked.hidden.has('never')).toBe(true);
    expect(picked.hidden.has('on-text')).toBe(true);
    expect(evaluate(extended, { 'solution-integration': { pick: { value: { selected: 'b' } } } }, {}).hidden.has('when-a')).toBe(true);
  });

  it('treats "anything but" and not-applicable answers correctly', () => {
    expect(evaluate(mini, { 'solution-integration': { hosting: { value: { selected: ['none'] } } } }, {}).hidden.has('detail')).toBe(true);
    expect(evaluate(mini, { 'solution-integration': { hosting: { value: { selected: ['none', 'saas'] } } } }, {}).hidden.has('detail')).toBe(false);
    expect(evaluate(mini, { 'solution-integration': { hosting: { notApplicable: true, reason: 'n/a' } } }, {}).hidden.has('detail')).toBe(true);
  });
});

describe('completion', () => {
  it('counts shown questions only, accepting not-applicable with a reason and TRM values', () => {
    const empty = only(evaluate(mini, {}, {}));
    expect(empty).toEqual({ section: 'solution-integration', total: 7, answered: 1, missing: ['hosting', 'fixed', 'rows', 'pick', 'retention', 'owner'] });
    const done = only(
      evaluate(
        mini,
        {
          'solution-integration': {
            hosting: { value: { selected: ['saas'] } },
            detail: { value: 'Hosted by vendor' },
            fixed: { value: [{ row: 'A', cells: { x: '1' } }, { row: 'B', cells: { x: '2' } }] },
            rows: { notApplicable: true, reason: 'None yet' },
            pick: { value: { selected: 'a' } },
            retention: { value: { rows: [{ standardId: STANDARD, resourceName: 'sql-01' }] } },
          },
        },
        { businessOwner: 'Ada' },
      ),
    );
    expect(done).toEqual({ section: 'solution-integration', total: 8, answered: 8, missing: [] });
  });

  it.each([
    ['a fixed row left out', { fixed: { value: [{ row: 'A', cells: { x: '1' } }] } }, 'fixed'],
    ['an empty required cell', { fixed: { value: [{ row: 'A', cells: { x: '1' } }, { row: 'B', cells: { x: ' ' } }] } }, 'fixed'],
    ['a table with no rows', { rows: { value: [] } }, 'rows'],
    ['"other" without saying what', { pick: { value: { selected: 'other' } } }, 'pick'],
    ['a multiple choice with nothing ticked', { hosting: { value: { selected: [] } } }, 'hosting'],
    ['"other" ticked without saying what', { hosting: { value: { selected: ['other'] } } }, 'hosting'],
    ['a retention row without a resource name', { retention: { value: { rows: [{ standardId: STANDARD, resourceName: '' }] } } }, 'retention'],
    ['an empty short answer', { hosting: { value: { selected: ['saas'] } }, detail: { value: '  ' } }, 'detail'],
  ])('does not count %s', (_, answers, key) => {
    expect(only(evaluate(mini, { 'solution-integration': answers }, {})).missing).toContain(key);
  });

  it('needs one URL per API row, and data objects with both their object and key attributes (2026-10-25)', () => {
    const apis = (row: Record<string, unknown>) =>
      evaluate(SAD_TEMPLATE, { 'security-design': { 'uses-apis': { value: { answer: 'yes' } } }, 'api-inventory': { apis: { value: [{ cells: row }] } } }, {})
        .sections.find((s) => s.section === 'api-inventory')!
        .missing.includes('apis');
    const person = { id: '00000000-0000-4000-8000-000000000001', name: 'Ada' };
    const full = {
      name: 'Policy API',
      description: 'Policies',
      apiOwner: person,
      businessOwner: { name: 'Claims team' },
      uatUrl: 'https://uat.aia.com/policy',
      authMethod: 'oauth-2-0',
      hosting: 'cloud',
      thirdParty: 'no',
      classification: 'internal',
      data: [{ object: 'Policy', attributes: 'policy number, premium' }],
      priority: 'high',
      justification: 'Core',
    };
    expect(apis(full)).toBe(false);
    expect(apis({ ...full, uatUrl: undefined })).toBe(true);
    expect(apis({ ...full, uatUrl: ' ', devUrl: 'https://dev.aia.com/policy' })).toBe(false);
    expect(apis({ ...full, data: [] })).toBe(true);
    expect(apis({ ...full, data: [{ object: 'Policy', attributes: ' ' }] })).toBe(true);
    expect(apis({ ...full, data: [{ object: 'Policy', attributes: 'number' }, { object: '', attributes: 'x' }] })).toBe(true);
  });

  it('needs the author to answer a TRM field that TRM does not hold, and counts empty rich text as unanswered', () => {
    const details = (answers: Record<string, unknown>, trm: Record<string, unknown>) =>
      evaluate(SAD_TEMPLATE, { 'application-details': answers as never }, trm).sections.find((s) => s.section === 'application-details')!;
    expect(details({}, { name: 'CRM', number: 'APM-1', dataClassification: null }).missing).toContain('data-classification');
    expect(details({ 'data-classification': { value: { selected: 'internal' } } }, { dataClassification: null }).missing).not.toContain('data-classification');
    expect(details({}, { dataClassification: 'Confidential', productManagers: [] }).missing).toEqual(expect.arrayContaining(['product-manager']));
    expect(details({}, { dataClassification: 'Confidential' }).missing).not.toContain('data-classification');
    const overview = evaluate(SAD_TEMPLATE, { 'solution-integration': { 'solution-overview': { value: doc('') } } }, {}).sections.find((s) => s.section === 'solution-integration')!;
    expect(overview.missing).toContain('solution-overview');
  });
});

describe('diagrams', () => {
  const box = { id: 'b', label: 'Box', type: 'generic', x: 0, y: 0 };
  const drawn = (id: string, tab?: 'production' | 'non-production') => ({ id, title: id, ...(tab ? { tab } : {}), sizing: 'auto' as const, zones: [], boxes: [box], lines: [] });
  const withDiagrams: SadTemplate = {
    version: 2,
    sections: [
      {
        key: 'solution-integration',
        title: 'S',
        references: [],
        groups: [
          { key: 'g', items: [{ type: 'short', key: 'overview', label: 'Overview' }], diagrams: [{ slot: 'solution', view: 'solution' }, { slot: 'infrastructure', view: 'integration' }] },
          { key: 'hidden', showWhen: { question: 'missing', anyOf: ['x'] }, items: [], diagrams: [{ slot: 'monitoring', view: 'monitoring' }] },
        ],
      },
      { key: 'network', title: 'N', references: [], groups: [{ key: 'n', items: [], diagrams: [{ slot: 'infrastructure', view: 'infrastructure' }] }] },
      { key: 'resiliency', title: 'R', references: [], groups: [{ key: 'r', items: [], diagrams: [{ slot: 'infrastructure', view: 'infrastructure' }] }] },
      { key: 'data-architecture', title: 'D', references: [], groups: [{ key: 'd', items: [], diagrams: [{ slot: 'solution', view: 'data-flow' }] }] },
      { key: 'logging', title: 'L', references: [], groups: [{ key: 'l', showWhen: { question: 'overview', anyOf: ['x'] }, items: [], diagrams: [{ slot: 'monitoring', view: 'monitoring' }] }] },
    ],
  };

  it('counts each view in the section that edits it: the drawing view until it is drawn or Not applicable, read-only views never', () => {
    const empty = evaluate(withDiagrams, {}, {}, {});
    expect(empty.sections.map((s) => [s.section, s.total, s.missing])).toEqual([
      ['solution-integration', 3, ['overview', 'diagram:solution']],
      ['network', 1, ['diagram:infrastructure']],
      ['resiliency', 0, []],
      ['data-architecture', 1, []],
      ['logging', 0, []],
    ]);
    const done = evaluate(withDiagrams, {}, {}, { solution: { diagrams: [drawn('solution')] }, infrastructure: { notApplicable: true, reason: 'SaaS: nothing of ours to draw' } });
    expect(done.sections.map((s) => s.missing)).toEqual([['overview'], [], [], [], []]);
  });

  it("needs every integration connection's facts in section 2, and its API still in section 6's API inventory", () => {
    const api = '0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f';
    const boxes = [{ ...box, type: 'server' }, { id: 'c', label: 'Bank', type: 'external', x: 300, y: 0 }];
    const facts = { protocol: 'HTTPS', port: 443, tls: '1.2', pattern: 'api', api: { id: api }, authentication: 'OAuth 2.0', classification: 'confidential', purpose: 'Payments', flow: 'service' };
    const infrastructure = (line: object) => ({ diagrams: [{ ...drawn('production', 'production'), boxes, lines: [{ id: 'l', from: 'b', to: 'c', layer: 'integration', ...line }] }, drawn('non-production', 'non-production')] });
    const inventory = (id: string) => ({ 'api-inventory': { apis: { value: [{ id, cells: {} }, { cells: {} }] } } });
    const linked = evaluate(withDiagrams, inventory(api), {}, { infrastructure: infrastructure(facts) } as SadDiagrams);
    expect(linked.sections[0].missing).toEqual(['overview', 'diagram:solution']);
    const gone = evaluate(withDiagrams, inventory('9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d'), {}, { infrastructure: infrastructure(facts) } as SadDiagrams);
    expect(gone.sections[0].missing).toEqual(['overview', 'diagram:solution', 'diagram:infrastructure:integration']);
    const unanswered = evaluate(withDiagrams, {}, {}, { infrastructure: infrastructure({ protocol: 'HTTPS' }) } as SadDiagrams);
    expect(unanswered.sections[0].missing).toContain('diagram:infrastructure:integration');
  });

  it('needs both infrastructure tabs drawn', () => {
    const one = evaluate(withDiagrams, {}, {}, { infrastructure: { diagrams: [drawn('production', 'production'), { ...drawn('non-production', 'non-production'), boxes: [] }] } });
    expect(one.sections[1].missing).toEqual(['diagram:infrastructure']);
  });

  it('needs every solution connection described in section 2, and the data flow facts of connections with data objects in section 9', () => {
    const blocks = [{ ...box, type: 'part' }, { id: 'c', label: 'Bank', type: 'external', x: 300, y: 0 }];
    const solution = (line: object) => ({ diagrams: [{ ...drawn('solution'), boxes: blocks, lines: [{ id: 'l', from: 'b', to: 'c', ...line }] }] });
    const undescribed = evaluate(withDiagrams, {}, {}, { solution: solution({ calls: 'Payment API', data: 'Payment: amount' }) });
    expect(undescribed.sections[0].missing).toEqual(['overview', 'diagram:solution']);
    expect(undescribed.sections[3].missing).toEqual(['diagram:solution:data-flow']);
    const complete = evaluate(withDiagrams, {}, {}, { solution: solution({ calls: 'Payment API', does: 'Collects premiums', data: 'Payment: amount', classification: 'confidential', frequency: 'Real time' }) });
    expect(complete.sections[0].missing).toEqual(['overview']);
    expect(complete.sections[3]).toMatchObject({ total: 1, answered: 1, missing: [] });
  });
});

describe("the real template's show/hide rules (2026-10-25)", () => {
  const hiddenWith = (answers: Record<string, Record<string, unknown>>) => evaluate(SAD_TEMPLATE, answers as never, {}).hidden;
  const pick = (selected: string | string[]) => ({ value: { selected } });
  const yes = { value: { answer: 'yes' } };

  it.each([
    ['AIA Azure hosting shows the AIA-hosted questions', { 'solution-integration': { 'hosting-location': pick(['aia-azure']) } }, ['vm-check-in', 'base-image']],
    ['AIA PDC/SDC hosting shows them too', { 'solution-integration': { 'hosting-location': pick(['aia-ssdc']) } }, ['vm-check-in']],
    ['3rd-party SaaS hosting shows the SaaS questions and the SOC2/ISO controls', { 'solution-integration': { 'hosting-location': pick(['3rd-party-saas']) } }, ['tpsa', 'vulnerability-management']],
    ['external or internet accessibility shows the protection technology', { 'solution-integration': { accessibility: pick(['internet']) } }, ['internet-protection']],
    ['local custom authentication asks why', { 'security-design': { 'authentication-method': pick('local-custom-authentication') } }, ['local-auth-justification']],
    ['another authentication method asks why too', { 'security-design': { 'authentication-method': { value: { selected: 'other', other: 'Kerberos' } } } }, ['local-auth-justification']],
    ['3rd-party access other than None asks the other 3rd-party questions', { 'security-design': { 'third-party-access': pick(['vpn']) } }, ['third-party-environments', 'third-party-privileges']],
    ['using APIs shows API security and the API inventory', { 'security-design': { 'uses-apis': yes } }, ['api-auth', 'api-session-timeout', 'api-refresh-token', 'api-traffic', 'apis']],
    ['using Generative AI shows the other Generative AI questions', { 'security-design': { 'uses-genai': yes } }, ['rai-assessment', 'genai-data-sharing', 'genai-hosting', 'genai-tenancy', 'genai-status']],
    ['a mobile application shows the publishing questions', { 'security-design': { 'application-type': pick(['mobile']) } }, ['internal-distribution', 'google-play', 'huawei-appgallery']],
  ])('%s', (_, answers, shown) => {
    const before = hiddenWith({});
    for (const key of shown) expect(before.has(key), `${key} hidden at first`).toBe(true);
    const after = hiddenWith(answers);
    for (const key of shown) expect(after.has(key), `${key} shown`).toBe(false);
  });

  it('keeps the rules shut for the other answers: AD based, no 3rd-party access, no APIs, a web application', () => {
    const hidden = hiddenWith({
      'solution-integration': { accessibility: pick(['internal']) },
      'security-design': { 'authentication-method': pick('ad-based'), 'third-party-access': pick(['none']), 'uses-apis': { value: { answer: 'no' } }, 'application-type': pick(['web']) },
    });
    for (const key of ['internet-protection', 'local-auth-justification', 'third-party-environments', 'api-auth', 'apis', 'internal-distribution']) expect(hidden.has(key), key).toBe(true);
  });
});
