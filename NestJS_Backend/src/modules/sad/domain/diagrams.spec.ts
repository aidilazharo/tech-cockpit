import { describe, expect, it } from 'vitest';
import {
  changedViews,
  diagramAnswered,
  hiddenParts,
  emptyContent,
  newPicks,
  restoreFacts,
  settlePicks,
  slotContentSchema,
  viewAnswered,
  withoutFacts,
  type Diagram,
  type DiagramContent,
  type DiagramSlot,
} from './diagrams.js';

const zone = (id: string, extra: object = {}) => ({ id, label: `Zone ${id}`, x: 0, y: 0, width: 300, height: 200, ...extra });
const box = (id: string, extra: object = {}) => ({ id, label: `Box ${id}`, type: 'monitoring', x: 10, y: 40, ...extra });
const line = (id: string, from: string, to: string, extra: object = {}) => ({ id, from, to, ...extra });
const page = (id: string, extra: Partial<Diagram> = {}): Diagram => ({ id, title: `Diagram ${id}`, sizing: 'auto', zones: [], boxes: [], lines: [], ...extra });
const infra = (production: Partial<Diagram> = {}, nonProduction: Partial<Diagram> = {}) => {
  const { hosting, diagrams } = emptyContent('infrastructure');
  return { hosting, diagrams: [{ ...diagrams[0], ...production }, { ...diagrams[1], ...nonProduction }] };
};
const parse = (slot: DiagramSlot, content: unknown) => slotContentSchema(slot).safeParse(content);
const messages = (slot: DiagramSlot, content: unknown) => {
  const result = parse(slot, content);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('diagram content', () => {
  it('accepts zones inside zones, boxes in zones and lines between boxes and zones (shapes on every diagram but the solution one)', () => {
    const content = {
      diagrams: [
        page('solution', {
          sizing: 'manual',
          zones: [zone('crm', { kind: 'This application' }), zone('inner', { parentId: 'crm' })],
          boxes: [box('portal', { parentId: 'inner' }), box('bank')],
          lines: [line('l1', 'portal', 'bank', { fromSide: 'r', toSide: 'l', label: 'Payment API', dashed: true, twoWay: true }), line('l2', 'bank', 'crm')],
        }),
      ],
    };
    expect(parse('monitoring', content).success).toBe(true);
  });

  it.each([
    ['an unknown property', { boxes: [box('a', { colour: 'red' })] }, 'Unrecognized key: "colour"'],
    ['a blank label', { boxes: [box('a', { label: '  ' })] }, 'Too small: expected string to have >=1 characters'],
    ['an id with spaces', { boxes: [box('a b')] }, 'Use letters, digits, - or _ (up to 64)'],
    ['an endless coordinate', { boxes: [box('a', { x: Number.POSITIVE_INFINITY })] }, 'Invalid input: expected number, received Infinity'],
    ['a tiny zone', { zones: [zone('z', { width: 5 })] }, 'Too small: expected number to be >=20'],
    ['the same id twice', { zones: [zone('a')], boxes: [box('a')] }, '"a" is used twice'],
    ['a box in a zone that does not exist', { boxes: [box('a', { parentId: 'nowhere' })] }, 'Not a zone on this diagram'],
    ['a zone in a box', { zones: [zone('z', { parentId: 'a' })], boxes: [box('a')] }, 'Not a zone on this diagram'],
    ['zones inside each other', { zones: [zone('a', { parentId: 'b' }), zone('b', { parentId: 'a' })] }, 'A zone cannot be inside itself'],
    ['a line to nothing', { boxes: [box('a')], lines: [line('l', 'a', 'gone')] }, 'Not a box or zone on this diagram'],
    ['a line from a box to itself', { boxes: [box('a')], lines: [line('l', 'a', 'a')] }, 'A line needs two different ends'],
  ])('refuses %s', (_, extra, message) => {
    expect(messages('solution', { diagrams: [page('solution', extra as Partial<Diagram>)] })).toContain(message);
  });

  it("lets any box show an Azure icon from Microsoft's set", () => {
    expect(messages('monitoring', { diagrams: [page('m', { boxes: [box('a', { icon: 'log-analytics-workspaces' })] })] })).toEqual([]);
    expect(messages('monitoring', { diagrams: [page('m', { boxes: [box('a', { icon: 'moon' })] })] })).toEqual(['Not an Azure icon']);
  });

  it('caps what one diagram may hold', () => {
    const boxes = Array.from({ length: 301 }, (_, i) => box(`b${i}`));
    expect(messages('solution', { diagrams: [page('solution', { boxes } as Partial<Diagram>)] })).toContain('Too big: expected array to have <=300 items');
  });
});

describe('slots', () => {
  it('holds one solution diagram, without tabs', () => {
    expect(parse('solution', { diagrams: [page('solution')] }).success).toBe(true);
    expect(messages('solution', { diagrams: [page('solution'), page('s2')] })).toContain('The solution diagram is one diagram');
    expect(messages('solution', { diagrams: [page('s1', { tab: 'production' })] })).toContain('Only the infrastructure diagram has tabs');
  });

  it('holds the infrastructure diagram as a Production and a Non-production tab, in that order', () => {
    expect(parse('infrastructure', infra()).success).toBe(true);
    const swapped = { ...infra(), diagrams: [...infra().diagrams].reverse() };
    expect(messages('infrastructure', swapped)).toContain('The infrastructure diagram has a Production and a Non-production tab');
    expect(messages('infrastructure', { ...infra(), diagrams: [infra().diagrams[0]] })).toContain('The infrastructure diagram has a Production and a Non-production tab');
  });

  it('keeps the solution diagram and the infrastructure tabs under their own ids, so what other sections keep with them is found again', () => {
    expect(messages('solution', { diagrams: [page('renamed')] })).toContain('The solution diagram keeps the id "solution"');
    const renamed = infra();
    renamed.diagrams[0] = { ...renamed.diagrams[0], id: 'prod2' };
    expect(messages('infrastructure', renamed)).toContain('Each tab keeps its id ("production", "non-production")');
  });

  it('holds up to ten titled CI/CD or monitoring diagrams, each with its own id', () => {
    expect(parse('ci-cd', { diagrams: [page('ci'), page('cd')] }).success).toBe(true);
    expect(parse('monitoring', { diagrams: [page('m1')] }).success).toBe(true);
    expect(messages('ci-cd', { diagrams: [page('same'), page('same')] })).toContain('Each diagram needs its own id');
    expect(messages('monitoring', { diagrams: Array.from({ length: 11 }, (_, i) => page(`m${i}`)) })).toContain('Too big: expected array to have <=10 items');
    expect(messages('ci-cd', { diagrams: [] })).toContain('Too small: expected array to have >=1 items');
  });

  it('can be Not applicable, with a reason', () => {
    expect(parse('monitoring', { notApplicable: true, reason: 'Monitored by the vendor' }).success).toBe(true);
    expect(parse('monitoring', { notApplicable: true, reason: ' ' }).success).toBe(false);
    expect(parse('monitoring', { notApplicable: true, reason: 'x', diagrams: [page('m1')] }).success).toBe(false);
  });
});

describe('answered', () => {
  it('counts a slot as answered when every diagram has a box, or it is Not applicable with a reason', () => {
    expect(diagramAnswered({ notApplicable: true, reason: 'SaaS, no infrastructure of ours' })).toBe(true);
    expect(diagramAnswered({ diagrams: [page('s', { boxes: [box('a')] })] })).toBe(true);
    expect(diagramAnswered({ diagrams: [page('s', { zones: [zone('z')] })] })).toBe(false);
  });

  it('needs both infrastructure tabs and every titled diagram drawn', () => {
    expect(diagramAnswered(infra({ boxes: [box('a')] }, { boxes: [box('b')] }))).toBe(true);
    expect(diagramAnswered(infra({ boxes: [box('a')] }))).toBe(false);
    expect(diagramAnswered({ diagrams: [page('ci', { boxes: [box('a')] }), page('cd')] })).toBe(false);
  });
});

describe('empty content', () => {
  it.each([
    ['solution', ['Solution diagram']],
    ['infrastructure', ['Production', 'Non-production']],
    ['ci-cd', ['CI and CD flow']],
    ['monitoring', ['Monitoring']],
  ] as const)('starts the %s slot valid, unanswered and sized automatically', (slot, titles) => {
    const content = emptyContent(slot);
    expect(parse(slot, content).success).toBe(true);
    expect(diagramAnswered(content)).toBe(false);
    expect(content.diagrams.map((d) => d.title)).toEqual(titles);
    expect(content.diagrams.every((d) => d.sizing === 'auto')).toBe(true);
  });
});

const POLICY = '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const PORTAL = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const solution = (extra: Partial<Diagram> = {}): { diagrams: Diagram[] } => ({
  diagrams: [
    page('solution', {
      zones: [zone('crm', { kind: 'This application' })],
      boxes: [
        box('customer', { type: 'actor' }),
        box('core', { type: 'part', parentId: 'crm' }),
        box('policy', { type: 'business', label: 'Policy Admin', application: { id: POLICY, number: 'APM-0002' } }),
        box('bank', { type: 'external' }),
      ] as Diagram['boxes'],
      lines: [
        line('l1', 'customer', 'core', { calls: 'Agent portal (web)', does: 'Manage leads' }),
        line('l2', 'core', 'policy', { calls: 'Policy API: create policy', does: 'Issues the policy', twoWay: true, data: 'Policy: policy no., premium', classification: 'confidential', frequency: 'Real time, ~500 a day' }),
      ] as Diagram['lines'],
      ...extra,
    }),
  ],
});
const first = (content: DiagramContent) => (content as { diagrams: Diagram[] }).diagrams[0];
const withLine = (index: number, change: object) => {
  const content = solution();
  content.diagrams[0].lines[index] = { ...content.diagrams[0].lines[index], ...change };
  return content;
};

describe('solution diagram', () => {
  it('holds actors, parts of this application, business applications (picked from TRM or typed) and external parties, with connection facts', () => {
    expect(parse('solution', solution()).success).toBe(true);
    expect(parse('solution', solution({ boxes: [box('typed', { type: 'business', label: 'Old CRM' })], lines: [] } as Partial<Diagram>)).success).toBe(true);
  });

  it.each([
    ['a block of another type', { boxes: [box('a', { type: 'web' })] }, 'Choose Actor, Part of this application, Business application or External party'],
    ['a TRM link on a block that is not a business application', { boxes: [box('a', { type: 'actor', application: { id: POLICY, number: null } })] }, 'Only a business application block links to TRM'],
    ['a TRM link that is not an id', { boxes: [box('a', { type: 'business', application: { id: 'policy', number: null } })] }, 'Invalid UUID'],
    ['a label on a connection', { boxes: [box('a', { type: 'actor' }), box('b', { type: 'part' })], lines: [line('l', 'a', 'b', { label: 'HTTPS' })] }, 'A connection says what it calls and what it does instead of a label'],
    ['an unknown classification', { boxes: [box('a', { type: 'actor' }), box('b', { type: 'part' })], lines: [line('l', 'a', 'b', { classification: 'secret' })] }, 'Invalid option: expected one of "public"|"internal"|"confidential"|"highly-confidential"'],
  ])('refuses %s', (_, extra, message) => {
    expect(messages('solution', { diagrams: [page('solution', extra as Partial<Diagram>)] })).toContain(message);
  });

  it('keeps connection facts to the solution diagram, and TRM links off CI and CD flows', () => {
    const facts = { diagrams: [page('m', { boxes: [box('a'), box('b')], lines: [line('l', 'a', 'b', { calls: 'API', data: 'Logs' })] } as Partial<Diagram>)] };
    expect(messages('monitoring', facts)).toEqual(['Only the solution diagram has this']);
    const lane = zone('lane', { kind: 'lane' });
    const linked = { diagrams: [page('ci', { zones: [lane], boxes: [box('a', { type: 'step', parentId: 'lane', application: { id: POLICY, number: null } })] } as Partial<Diagram>)] };
    expect(messages('ci-cd', linked)).toEqual(['Only the solution, infrastructure and monitoring diagrams have this']);
  });

  it('has at most one grouping box that is the application itself', () => {
    expect(messages('solution', solution({ zones: [zone('crm', { kind: 'This application' }), zone('crm2', { kind: 'This application' })] }))).toContain('Only one grouping box can be "This application"');
  });

  it('starts with a grouping box named after the application, sized like an empty zone in the editor', () => {
    const [crm] = emptyContent('solution', 'CRM').diagrams[0].zones;
    expect(crm).toEqual({ id: 'zone-1', label: 'CRM', kind: 'This application', x: 0, y: 0, width: Math.round(3 * 8.5 + 16 * 7 + 170), height: 40 });
    expect(parse('solution', emptyContent('solution', 'CRM')).success).toBe(true);
  });
});

describe('what counts for submit, per view', () => {
  it('counts the solution view in section 2: a block, and every connection says what it calls and what it does', () => {
    expect(viewAnswered('solution', 'solution', solution())).toBe(true);
    expect(viewAnswered('solution', 'solution', withLine(0, { does: ' ' }))).toBe(false);
    expect(viewAnswered('solution', 'solution', withLine(1, { calls: undefined }))).toBe(false);
    expect(viewAnswered('solution', 'solution', emptyContent('solution', 'CRM'))).toBe(false);
  });

  it('counts the data flow view in section 9: a connection with data objects needs its classification and frequency', () => {
    expect(viewAnswered('solution', 'data-flow', solution())).toBe(true);
    expect(viewAnswered('solution', 'data-flow', emptyContent('solution'))).toBe(true);
    expect(viewAnswered('solution', 'data-flow', withLine(1, { classification: undefined }))).toBe(false);
    expect(viewAnswered('solution', 'data-flow', withLine(1, { frequency: '  ' }))).toBe(false);
    expect(viewAnswered('solution', 'data-flow', withLine(1, { data: ' ', classification: undefined, frequency: undefined }))).toBe(true);
    expect(viewAnswered('solution', 'data-flow', { notApplicable: true, reason: 'No data' })).toBe(true);
  });

  it('counts the other slots as before; a view without facts of its own needs nothing', () => {
    expect(viewAnswered('monitoring', 'monitoring', { diagrams: [page('m', { boxes: [box('a')] })] })).toBe(true);
    expect(viewAnswered('infrastructure', 'infrastructure', infra({ boxes: [box('a')] }))).toBe(false);
    expect(viewAnswered('infrastructure', 'integration', infra())).toBe(true);
  });
});

describe('who changed which part', () => {
  it('splits a solution diagram change into the solution part (section 2) and the data flow facts (section 9)', () => {
    const before = solution();
    expect(changedViews('solution', before, solution())).toEqual(new Set());
    const moved = solution();
    moved.diagrams[0].boxes[0].x = 400;
    expect(changedViews('solution', before, moved)).toEqual(new Set(['solution']));
    expect(changedViews('solution', before, withLine(1, { frequency: 'Nightly' }))).toEqual(new Set(['data-flow']));
    expect(changedViews('solution', before, withLine(0, { calls: 'Lead API', data: 'Lead: name' }))).toEqual(new Set(['solution', 'data-flow']));
    // Removing a connection removes its facts with it: that is the solution part's change.
    const removed = solution();
    removed.diagrams[0].lines.pop();
    expect(changedViews('solution', before, removed)).toEqual(new Set(['solution']));
    const added = solution();
    added.diagrams[0].lines.push(line('l3', 'core', 'bank', { data: 'Payment' }) as Diagram['lines'][number]);
    expect(changedViews('solution', before, added)).toEqual(new Set(['solution', 'data-flow']));
    expect(changedViews('solution', before, { notApplicable: true, reason: 'SaaS' })).toEqual(new Set(['solution']));
    expect(changedViews('solution', { notApplicable: true, reason: 'SaaS' }, before)).toEqual(new Set(['solution', 'data-flow']));
  });

  it('ignores the order of keys (the database stores JSON with its own order)', () => {
    const reordered = JSON.parse(JSON.stringify(solution(), (_, value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value)));
    expect(changedViews('solution', reordered, solution())).toEqual(new Set());
  });

  it('gives every change of the other slots to their drawing view', () => {
    const before = { diagrams: [page('m')] };
    expect(changedViews('monitoring', before, { diagrams: [page('m', { title: 'Alerts' })] })).toEqual(new Set(['monitoring']));
    expect(changedViews('monitoring', before, { diagrams: [page('m')] })).toEqual(new Set());
  });
});

describe('facts a reader cannot see', () => {
  it('names, for the editor, the connections that carry facts of a view they cannot read (never the facts)', () => {
    expect(hiddenParts(solution(), ['data-flow'])).toEqual([{ diagramId: 'solution', takenIds: [], carriers: [{ id: 'l2', view: 'data-flow' }] }]);
    expect(hiddenParts(solution(), ['solution'])).toEqual([{ diagramId: 'solution', takenIds: [], carriers: [{ id: 'l1', view: 'solution' }, { id: 'l2', view: 'solution' }] }]);
  });


  it('leaves out what a connection calls and does (section 2) or its data flow facts (section 9)', () => {
    expect(first(withoutFacts(solution(), ['solution'])).lines[1]).toEqual({ id: 'l2', from: 'core', to: 'policy', twoWay: true, data: 'Policy: policy no., premium', classification: 'confidential', frequency: 'Real time, ~500 a day' });
    expect(first(withoutFacts(solution(), ['data-flow'])).lines[1]).toEqual({ id: 'l2', from: 'core', to: 'policy', calls: 'Policy API: create policy', does: 'Issues the policy', twoWay: true });
    expect(withoutFacts(solution(), [])).toEqual(solution());
    const notApplicable = { notApplicable: true as const, reason: 'SaaS' };
    expect(withoutFacts(notApplicable, ['solution'])).toBe(notApplicable);
  });

  it('puts the hidden facts back from what was stored when the reader saves, so hiding them never erases them', () => {
    const saved = withoutFacts(withLine(1, { frequency: 'Nightly' }), ['solution']) as { diagrams: Diagram[] };
    saved.diagrams[0].lines.push(line('l3', 'core', 'bank') as Diagram['lines'][number]);
    const restored = first(restoreFacts(solution(), saved, ['solution']));
    expect(restored.lines[1]).toMatchObject({ calls: 'Policy API: create policy', does: 'Issues the policy', frequency: 'Nightly' });
    expect(restored.lines[2]).toEqual({ id: 'l3', from: 'core', to: 'bank' });
    expect(changedViews('solution', solution(), restoreFacts(solution(), withoutFacts(solution(), ['data-flow']), ['data-flow']))).toEqual(new Set());
    expect(restoreFacts(null, solution(), ['solution'])).toEqual(solution());
    const notApplicable = { notApplicable: true as const, reason: 'SaaS' };
    expect(restoreFacts(solution(), notApplicable, ['solution'])).toBe(notApplicable);
    expect(restoreFacts(notApplicable, solution(), ['solution'])).toEqual(solution());
  });
});

describe('business applications picked from TRM', () => {
  it('finds the blocks newly linked to TRM, with where they are', () => {
    const before = solution();
    expect(newPicks(before, solution())).toEqual([]);
    const repicked = solution();
    repicked.diagrams[0].boxes[2] = { ...repicked.diagrams[0].boxes[2], application: { id: PORTAL, number: null } };
    repicked.diagrams[0].boxes.push(box('portal2', { type: 'business', application: { id: PORTAL, number: null } }) as Diagram['boxes'][number]);
    expect(newPicks(before, repicked)).toEqual([
      { path: ['diagrams', 0, 'boxes', 2, 'application', 'id'], id: PORTAL },
      { path: ['diagrams', 0, 'boxes', 4, 'application', 'id'], id: PORTAL },
    ]);
    expect(newPicks(null, before)).toEqual([{ path: ['diagrams', 0, 'boxes', 2, 'application', 'id'], id: POLICY }]);
    expect(newPicks(before, { notApplicable: true, reason: 'SaaS' })).toEqual([]);
  });

  it("refreshes a block picked again from TRM: the name sent is TRM's current one, so it takes TRM's current name and number", () => {
    const current = new Map([[POLICY, { name: 'Policy Administration', number: 'APM-0002A' }]]);
    const repicked = solution();
    repicked.diagrams[0].boxes[2] = { ...repicked.diagrams[0].boxes[2], label: 'Policy Administration', application: { id: POLICY, number: 'APM-0002A' } };
    expect(first(settlePicks(solution(), repicked, current)).boxes[2]).toMatchObject({ label: 'Policy Administration', application: { id: POLICY, number: 'APM-0002A' } });
    // Anything else typed over it keeps the name it was picked with.
    const typed = solution();
    typed.diagrams[0].boxes[2] = { ...typed.diagrams[0].boxes[2], label: 'Policy' };
    expect(first(settlePicks(solution(), typed, current)).boxes[2]).toMatchObject({ label: 'Policy Admin', application: { id: POLICY, number: 'APM-0002' } });
  });

  it('keeps the name and number a block was picked with, and takes TRM values for new picks', () => {
    const typedOver = solution();
    typedOver.diagrams[0].boxes[2] = { ...typedOver.diagrams[0].boxes[2], label: 'Typed over', application: { id: POLICY, number: 'APM-9999' } };
    typedOver.diagrams[0].boxes.push(box('portal', { type: 'business', label: 'anything', application: { id: PORTAL, number: null } }) as Diagram['boxes'][number]);
    const settled = first(settlePicks(solution(), typedOver, new Map([[PORTAL, { name: 'Customer Portal', number: 'APM-0005' }]])));
    expect(settled.boxes[2]).toMatchObject({ label: 'Policy Admin', application: { id: POLICY, number: 'APM-0002' } });
    expect(settled.boxes[4]).toMatchObject({ label: 'Customer Portal', application: { id: PORTAL, number: 'APM-0005' } });
    const notApplicable = { notApplicable: true as const, reason: 'SaaS' };
    expect(settlePicks(solution(), notApplicable, new Map())).toBe(notApplicable);
  });
});
