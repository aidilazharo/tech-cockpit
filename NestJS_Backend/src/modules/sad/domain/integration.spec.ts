import { describe, expect, it } from 'vitest';
import { changedViews, copyIntegration, emptyContent, hiddenParts, missingFacts, newApiLinks, nonCompliantTls, restoreFacts, slotContentSchema, viewAnswered, withoutFacts, type Diagram, type Line } from './diagrams.js';
import type { Hosting } from './infrastructure.js';

const API = '0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f';
const POLICY = '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
type Drawn = { hosting: Hosting; diagrams: Diagram[] };

const box = (id: string, type: string, parentId?: string, extra: object = {}) => ({ id, label: id, type, ...(parentId ? { parentId } : {}), x: 10, y: 40, ...extra });
const zone = (id: string, kind: string, parentId?: string) => ({ id, label: id, kind, ...(parentId ? { parentId } : {}), x: 0, y: 0, width: 300, height: 200 });
const database: Line = {
  id: 'g1',
  from: 'srv',
  to: 'sql',
  layer: 'integration',
  protocol: 'TDS',
  port: 1433,
  tls: '1.2',
  pattern: 'database',
  authentication: 'Managed identity',
  classification: 'highly-confidential',
  purpose: 'Store customers and leads',
  flow: 'service',
  twoWay: true,
};
const payments: Line = { ...database, id: 'g2', to: 'bank', protocol: 'HTTPS', port: 443, pattern: 'api', api: { id: API }, authentication: 'OAuth 2.0 + mTLS', classification: 'confidential', purpose: 'Collect premiums', twoWay: undefined };
const expressRoute: Line = { id: 'i1', from: 'vnet', to: 'primary-dc', label: 'ExpressRoute', twoWay: true };

/** Production with a subnet, a 3rd party zone, servers, a database, the bank, Policy Admin, two integration connections and an infrastructure line. */
const drawn = (): Drawn => {
  const content = emptyContent('infrastructure') as Drawn;
  const production = content.diagrams[0];
  production.zones.push(zone('vnet', 'vnet', 'primary-region'), zone('snet', 'subnet', 'vnet'), zone('third', 'third-party'));
  production.boxes.push(
    box('srv', 'server', 'snet'),
    box('sql', 'database', 'snet'),
    box('bank', 'external', 'third'),
    box('policy', 'business', undefined, { application: { id: POLICY, number: 'APM-0002' } }),
  );
  production.lines.push(database, payments, expressRoute);
  return content;
};
const messages = (content: unknown, slot: 'infrastructure' | 'monitoring' = 'infrastructure') => {
  const result = slotContentSchema(slot).safeParse(content);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
const withLine = (line: object) => {
  const content = drawn();
  content.diagrams[0].lines.push(line as Line);
  return content;
};
const edit = (fn: (production: Diagram, content: Drawn) => void) => {
  const content = drawn();
  fn(content.diagrams[0], content);
  return content;
};

describe('integration connections', () => {
  it('sit on the infrastructure diagram beside its infrastructure lines, with their facts', () => {
    expect(messages(drawn())).toEqual([]);
    expect(messages(withLine({ id: 'g3', from: 'srv', to: 'policy', layer: 'integration', tls: 'none', protection: 'SSH' }))).toEqual([]);
  });

  it.each<[string, object, string]>([
    ['a connection to a zone', { id: 'g3', from: 'srv', to: 'third', layer: 'integration' }, 'An integration connection joins two boxes'],
    ['integration facts on an infrastructure line', { id: 'i2', from: 'srv', to: 'sql', protocol: 'HTTPS' }, 'Only an integration connection has this'],
    ['a classification on an infrastructure line', { id: 'i2', from: 'srv', to: 'sql', classification: 'internal' }, 'Only an integration connection has this'],
    ['a port below 1', { id: 'g3', from: 'srv', to: 'sql', layer: 'integration', port: 0 }, 'Too small: expected number to be >=1'],
    ['a port above 65535', { id: 'g3', from: 'srv', to: 'sql', layer: 'integration', port: 70000 }, 'Too big: expected number to be <=65535'],
    ['a part of a port', { id: 'g3', from: 'srv', to: 'sql', layer: 'integration', port: 4.5 }, 'Invalid input: expected int, received number'],
    ['an unknown TLS version', { id: 'g3', from: 'srv', to: 'sql', layer: 'integration', tls: '1.4' }, 'Invalid option: expected one of "1.3"|"1.2"|"1.1"|"1.0"|"none"'],
    ['an API link on a database connection', { ...database, id: 'g3', api: { id: API } }, 'Only an API connection links to the API inventory'],
    ['what protects a TLS connection', { ...database, id: 'g3', protection: 'IPsec' }, 'Only a connection without TLS says what protects it'],
    ['what a solution connection calls', { ...database, id: 'g3', calls: 'Policy API' }, 'Only the solution diagram has this'],
  ])('refuses %s', (_, line, message) => {
    expect(messages(withLine(line))).toContain(message);
  });

  it('stays on the infrastructure diagram', () => {
    const monitoring = { diagrams: [{ id: 'm', title: 'M', sizing: 'auto', zones: [], boxes: [box('a', 'monitoring'), box('b', 'monitoring')], lines: [{ id: 'l', from: 'a', to: 'b', layer: 'integration', port: 443 }] }] };
    expect(messages(monitoring, 'monitoring')).toEqual(['Only the infrastructure diagram has this']);
  });
});

describe('what an integration connection needs before submit', () => {
  it('lists the missing facts: the API link for the API pattern, what protects it when not TLS', () => {
    expect(missingFacts('integration', { id: 'g', from: 'a', to: 'b', layer: 'integration', authentication: ' ' })).toEqual([
      'protocol',
      'port',
      'tls',
      'pattern',
      'authentication',
      'classification',
      'purpose',
      'flow',
    ]);
    expect(missingFacts('integration', { ...payments, api: undefined })).toEqual(['api']);
    expect(missingFacts('integration', { ...database, tls: 'none' })).toEqual(['protection']);
    expect(missingFacts('integration', database)).toEqual([]);
    expect(missingFacts('integration', expressRoute)).toEqual([]);
  });

  it('counts the integration view in section 2: every connection complete, linked to an API still in the inventory', () => {
    expect(viewAnswered('infrastructure', 'integration', drawn(), new Set([API]))).toBe(true);
    expect(viewAnswered('infrastructure', 'integration', drawn(), new Set())).toBe(false);
    expect(viewAnswered('infrastructure', 'integration', withLine({ id: 'g3', from: 'srv', to: 'sql', layer: 'integration' }), new Set([API]))).toBe(false);
    expect(viewAnswered('infrastructure', 'integration', { notApplicable: true, reason: 'SaaS' }, new Set())).toBe(true);
  });

  it('flags TLS 1.1 and 1.0 as not compliant, without blocking submit', () => {
    expect([nonCompliantTls({ ...database, tls: '1.1' }), nonCompliantTls({ ...database, tls: '1.0' }), nonCompliantTls(database), nonCompliantTls(expressRoute)]).toEqual([true, true, false, false]);
    expect(nonCompliantTls({ ...database, tls: undefined })).toBe(false);
    expect(missingFacts('integration', { ...database, tls: '1.0' })).toEqual([]);
  });
});

describe('who changes which part of the infrastructure diagram', () => {
  it('gives zones, servers, Azure services and infrastructure lines to section 3, and integration connections to section 2', () => {
    const before = drawn();
    expect(changedViews('infrastructure', before, drawn())).toEqual(new Set());
    expect(changedViews('infrastructure', before, edit((d) => (d.boxes[0].x = 300)))).toEqual(new Set(['infrastructure']));
    expect(changedViews('infrastructure', before, edit((_, c) => (c.hosting.subscription = 'MY02')))).toEqual(new Set(['infrastructure']));
    expect(changedViews('infrastructure', before, edit((d) => (d.lines[0] = { ...database, port: 1434 })))).toEqual(new Set(['integration']));
    expect(changedViews('infrastructure', before, withLine({ id: 'g3', from: 'srv', to: 'policy', layer: 'integration' }))).toEqual(new Set(['integration']));
    expect(changedViews('infrastructure', before, edit((d) => d.lines.shift()))).toEqual(new Set(['integration']));
  });

  it("lets either section place other applications and external parties; removing a box takes its connections with it as section 3's change", () => {
    const before = drawn();
    expect(changedViews('infrastructure', before, edit((d) => d.boxes.push(box('crm2', 'business'))))).toEqual(new Set());
    expect(changedViews('infrastructure', before, edit((d) => (d.boxes[2].x = 99)))).toEqual(new Set());
    const serverGone = edit((d) => {
      d.boxes = d.boxes.filter((b) => b.id !== 'srv');
      d.lines = d.lines.filter((l) => l.from !== 'srv' && l.to !== 'srv');
    });
    expect(changedViews('infrastructure', before, serverGone)).toEqual(new Set(['infrastructure']));
  });

  it('gives answering Not applicable, or drawing again after it, to section 3 (with the connections drawn again, to section 2 too)', () => {
    const notApplicable = { notApplicable: true as const, reason: 'SaaS' };
    expect(changedViews('infrastructure', drawn(), notApplicable)).toEqual(new Set(['infrastructure']));
    expect(changedViews('infrastructure', notApplicable, drawn())).toEqual(new Set(['infrastructure', 'integration']));
  });

  it("counts section 3's Copy from production, integration connections included, as its own change only when it asked for the copy", () => {
    const before = drawn();
    const copied = drawn();
    copied.diagrams[1] = { ...copied.diagrams[0], id: 'non-production', title: 'Non-production', tab: 'non-production' };
    expect(changedViews('infrastructure', before, copied, { copied: true })).toEqual(new Set(['infrastructure']));
    expect(changedViews('infrastructure', before, copied)).toEqual(new Set(['infrastructure', 'integration']));
    copied.diagrams[1].lines = copied.diagrams[1].lines.map((line) => (line.id === 'g1' ? { ...line, port: 1 } : line));
    expect(changedViews('infrastructure', before, copied, { copied: true })).toEqual(new Set(['infrastructure', 'integration']));
  });

  it("does not let section 3 remove non-production's integration connections by making them equal production's", () => {
    // Production has no integration connections; non-production has one.
    const before = drawn();
    before.diagrams[0] = { ...before.diagrams[0], lines: before.diagrams[0].lines.filter((line) => line.layer !== 'integration') };
    before.diagrams[1] = { ...before.diagrams[1], boxes: [box('srv', 'server', 'primary-dc'), box('sql', 'server', 'primary-dc')], lines: [{ ...database }] };
    const cleared = { ...before, diagrams: [before.diagrams[0], { ...before.diagrams[1], lines: [] }] };
    expect(changedViews('infrastructure', before, cleared)).toEqual(new Set(['integration']));
  });

  it("copies production's integration connections onto non-production's copied boxes (those whose ends are there)", () => {
    const content = drawn();
    content.diagrams[1] = { ...content.diagrams[1], boxes: [box('srv', 'server', 'primary-dc'), box('sql', 'server', 'primary-dc')], lines: [{ ...payments, id: 'old', to: 'sql' }, { ...expressRoute, id: 'i9', from: 'srv', to: 'sql' }] };
    const copied = copyIntegration(content) as Drawn;
    expect(copied.diagrams[1].lines.map((line) => line.id)).toEqual(['i9', 'g1']);
    expect(copied.diagrams[0]).toEqual(content.diagrams[0]);
    const notApplicable = { notApplicable: true as const, reason: 'SaaS' };
    expect(copyIntegration(notApplicable)).toBe(notApplicable);
  });

  it('ignores the zone sizes and places an automatic diagram fits around its boxes, but not those set by hand', () => {
    const before = drawn();
    const grown = edit((d) => {
      d.zones = d.zones.map((z) => (z.id === 'third' ? { ...z, width: 500, height: 260 } : z));
      d.boxes.push(box('bank2', 'external', 'third'));
    });
    expect(changedViews('infrastructure', before, grown)).toEqual(new Set());
    const byHand = (content: Drawn) => ({ ...content, diagrams: content.diagrams.map((d) => ({ ...d, sizing: 'manual' as const })) });
    expect(changedViews('infrastructure', byHand(before), byHand(grown))).toEqual(new Set(['infrastructure']));
  });
});

describe('lines a reader cannot see', () => {
  it('leaves out the integration connections (section 2) or the infrastructure lines (sections 3 and 4)', () => {
    const lines = (views: ('integration' | 'infrastructure')[]) => (withoutFacts(drawn(), views) as Drawn).diagrams[0].lines.map((line) => line.id);
    expect(lines(['integration'])).toEqual(['i1']);
    expect(lines(['infrastructure'])).toEqual(['g1', 'g2']);
  });

  it('keeps them as stored when that reader saves, except those whose box was removed; what the reader sends for them is ignored', () => {
    const before = drawn();
    const fromSection3 = withoutFacts(drawn(), ['integration']) as Drawn;
    fromSection3.diagrams[0].lines.push({ ...database, id: 'g9' });
    expect((restoreFacts(before, fromSection3, ['integration']) as Drawn).diagrams[0].lines.map((line) => line.id)).toEqual(['i1', 'g1', 'g2']);
    fromSection3.diagrams[0].boxes = fromSection3.diagrams[0].boxes.filter((b) => b.id !== 'bank');
    expect((restoreFacts(before, fromSection3, ['integration']) as Drawn).diagrams[0].lines.map((line) => line.id)).toEqual(['i1', 'g1']);
    expect(changedViews('infrastructure', before, restoreFacts(before, withoutFacts(drawn(), ['infrastructure']), ['infrastructure']))).toEqual(new Set());
  });
});

describe('what a reader cannot see, for the editor', () => {
  it('gives the ids of the lines left out (so new items never take them) and the items that carry them', () => {
    expect(hiddenParts(drawn(), ['integration'])).toEqual([
      { diagramId: 'production', takenIds: ['g1', 'g2'], carriers: [{ id: 'srv', view: 'integration' }, { id: 'sql', view: 'integration' }, { id: 'bank', view: 'integration' }] },
      { diagramId: 'non-production', takenIds: [], carriers: [] },
    ]);
    expect(hiddenParts(drawn(), ['infrastructure'])[0]).toEqual({ diagramId: 'production', takenIds: ['i1'], carriers: [{ id: 'vnet', view: 'infrastructure' }, { id: 'primary-dc', view: 'infrastructure' }] });
    expect(hiddenParts(drawn(), [])).toEqual([]);
    expect(hiddenParts({ notApplicable: true, reason: 'SaaS' }, ['integration'])).toEqual([]);
  });
});

describe('API links', () => {
  it('finds the connections newly linked to an API in the inventory, with where they are', () => {
    const before = drawn();
    expect(newApiLinks(before, drawn())).toEqual([]);
    const relinked = edit((d) => (d.lines[1] = { ...payments, api: { id: POLICY } }));
    expect(newApiLinks(before, relinked)).toEqual([{ path: ['diagrams', 0, 'lines', 1, 'api', 'id'], id: POLICY }]);
    expect(newApiLinks(null, before)).toEqual([{ path: ['diagrams', 0, 'lines', 1, 'api', 'id'], id: API }]);
    expect(newApiLinks(before, { notApplicable: true, reason: 'SaaS' })).toEqual([]);
  });
});
