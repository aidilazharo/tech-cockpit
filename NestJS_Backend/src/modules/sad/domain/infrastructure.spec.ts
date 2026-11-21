import { describe, expect, it } from 'vitest';
import {
  emptyContent,
  newPicks,
  settlePicks,
  slotContentSchema,
  type Diagram,
  type DiagramContent,
} from './diagrams.js';
import {
  applyHosting,
  DEFAULT_HOSTING,
  withHosting,
  type Hosting,
} from './infrastructure.js';

const SERVER = '5a27be1d-59d9-47d2-8070-6f33504dd0fb';
const POLICY = '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

type Drawn = { hosting: Hosting; diagrams: Diagram[] };
const fresh = (): Drawn =>
  emptyContent('infrastructure', 'CRM', DEFAULT_HOSTING) as Drawn;
const zone = (
  id: string,
  kind: string,
  parentId?: string,
  extra: object = {},
) => ({
  id,
  label: id,
  kind,
  ...(parentId ? { parentId } : {}),
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  ...extra,
});
const box = (
  id: string,
  type: string,
  parentId?: string,
  extra: object = {},
) => ({
  id,
  label: id,
  type,
  ...(parentId ? { parentId } : {}),
  x: 10,
  y: 40,
  ...extra,
});
/** Production drawn with every kind of zone and box in its place. */
const drawn = (): Drawn => {
  const content = fresh();
  const [production] = content.diagrams;
  production.zones.push(
    zone('vnet', 'vnet', 'primary-region'),
    zone('snet-app', 'subnet', 'vnet'),
    zone('internet', 'internet'),
    zone('global', 'azure-global'),
    zone('third', 'third-party'),
  );
  production.boxes.push(
    box('srv', 'server', 'snet-app', { server: { id: SERVER } }),
    box('web', 'azure', 'snet-app', { icon: 'app-services' }),
    box('legacy', 'web', 'snet-app'),
    box('kv', 'storage', 'primary-region'),
    box('batch', 'server', 'primary-dc'),
    box('agent', 'person', 'office'),
    box('fw', 'firewall', 'office'),
    box('office-srv', 'server', 'office'),
    box('customer', 'person', 'internet'),
    box('front-door', 'web', 'global'),
    box('bank', 'external', 'third'),
    box('policy', 'business', undefined, {
      application: { id: POLICY, number: 'APM-0002' },
    }),
    box('vnet-srv', 'server', 'vnet'),
    box('vnet-gw', 'azure', 'vnet', { icon: 'application-gateways' }),
    box('vnet-fw', 'firewall', 'vnet'),
  );
  production.lines.push({
    id: 'l1',
    from: 'vnet',
    to: 'primary-dc',
    label: 'ExpressRoute',
    twoWay: true,
  });
  return content;
};
const messages = (
  content: unknown,
  slot: 'infrastructure' | 'monitoring' = 'infrastructure',
) => {
  const result = slotContentSchema(slot).safeParse(content);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
};
const change = (fn: (production: Diagram, content: Drawn) => void) => {
  const content = drawn();
  fn(content.diagrams[0], content);
  return messages(content);
};

describe('infrastructure diagram content', () => {
  it('starts with the hosting settings and, on both tabs, the subscription with both regions, PDC, SDC and the office network', () => {
    const content = fresh();
    expect(messages(content)).toEqual([]);
    expect(content.hosting).toEqual(DEFAULT_HOSTING);
    expect(content.hosting).not.toBe(DEFAULT_HOSTING);
    for (const diagram of content.diagrams) {
      expect(
        diagram.zones.map((z) => [
          z.id,
          z.label,
          z.kind,
          z.hosting,
          z.parentId ?? null,
        ]),
      ).toEqual([
        ['subscription', 'MY01', 'subscription', 'subscription', null],
        [
          'primary-region',
          'Southeast Asia',
          'region',
          'primaryRegion',
          'subscription',
        ],
        ['dr-region', 'East Asia', 'region', 'drRegion', 'subscription'],
        ['primary-dc', 'PDC', 'data-centre', 'primaryDc', null],
        ['dr-dc', 'SDC', 'data-centre', 'drDc', null],
        ['office', 'Office network', 'office', 'officeNetwork', null],
      ]);
    }
    // The regions sit side by side in the subscription; the data centres and the office network in a row below it.
    const at = (id: string) =>
      content.diagrams[0].zones.find((z) => z.id === id)!;
    expect([at('primary-region').x, at('primary-region').y]).toEqual([20, 40]);
    expect(at('dr-region').x).toBe(
      at('primary-region').x + at('primary-region').width + 30,
    );
    expect(at('subscription').width).toBe(
      at('dr-region').x + at('dr-region').width + 20,
    );
    expect(at('subscription').height).toBe(
      at('primary-region').y + at('primary-region').height + 20,
    );
    expect(at('primary-dc').y).toBe(
      at('subscription').y + at('subscription').height + 30,
    );
    expect(at('office').x).toBe(at('dr-dc').x + at('dr-dc').width + 30);
  });

  it('holds every kind of zone and box in its place, with servers and business applications linked to TRM', () => {
    expect(messages(drawn())).toEqual([]);
  });

  it.each<[string, (production: Diagram, content: Drawn) => void, string]>([
    [
      'a subnet straight in a region',
      (d) => d.zones.push(zone('s', 'subnet', 'primary-region')),
      'A subnet sits inside a VNet',
    ],
    [
      'a VNet on its own',
      (d) => d.zones.push(zone('v', 'vnet')),
      'A VNet sits inside a region',
    ],
    [
      'a region outside the subscription',
      (d) => (d.zones[1].parentId = undefined),
      'A region sits inside the subscription',
    ],
    [
      'an Internet zone inside the subscription',
      (d) => d.zones.push(zone('i', 'internet', 'subscription')),
      'This zone sits on its own, not inside another',
    ],
    [
      'an unknown kind of zone',
      (d) => d.zones.push(zone('z', 'Network')),
      'Choose subscription, region, VNet, subnet, data centre, office network, Internet, Azure global services or 3rd party',
    ],
    [
      'a zone without a kind',
      (d) => d.zones.push({ ...zone('z', 'vnet'), kind: undefined }),
      'Choose subscription, region, VNet, subnet, data centre, office network, Internet, Azure global services or 3rd party',
    ],
    [
      'a person in PDC',
      (d) => d.boxes.push(box('p', 'person', 'primary-dc')),
      'A person sits in the office network or the Internet zone',
    ],
    [
      'a person in a VNet',
      (d) => d.boxes.push(box('p', 'person', 'vnet')),
      'A person sits in the office network or the Internet zone',
    ],
    [
      'a server outside the zones',
      (d) => d.boxes.push(box('s', 'server')),
      'A server sits in a subnet, a VNet, a data centre or the office network',
    ],
    [
      'a server straight in a region',
      (d) => d.boxes.push(box('s', 'server', 'primary-region')),
      'A server sits in a subnet, a VNet, a data centre or the office network',
    ],
    [
      'a network device in a subnet',
      (d) => d.boxes.push(box('f', 'vpn', 'snet-app')),
      'A network device sits in the office network or a VNet',
    ],
    [
      'an Azure service in PDC',
      (d) => d.boxes.push(box('w', 'api', 'primary-dc')),
      'An Azure service sits in a region, a subnet, a VNet or Azure global services',
    ],
    [
      'an external party in the Internet zone',
      (d) => d.boxes.push(box('e', 'external', 'internet')),
      'An external party sits in the 3rd party zone',
    ],
    [
      'an external party in a VNet',
      (d) => d.boxes.push(box('e', 'external', 'vnet')),
      'An external party sits in the 3rd party zone',
    ],
    [
      'a business application in a subnet',
      (d) => d.boxes.push(box('b', 'business', 'snet-app')),
      'A business application sits outside the zones',
    ],
    [
      'a business application in a VNet',
      (d) => d.boxes.push(box('b', 'business', 'vnet')),
      'A business application sits outside the zones',
    ],
    [
      'an unknown kind of box',
      (d) => d.boxes.push(box('m', 'mobile', 'snet-app')),
      'Choose server, person, network device, Azure service, external party or business application',
    ],
    [
      'an Azure service without its service',
      (d) => d.boxes.push(box('a', 'azure', 'snet-app')),
      'Choose the Azure service',
    ],
    [
      'an Azure service outside Azure',
      (d) =>
        d.boxes.push(box('a', 'azure', 'primary-dc', { icon: 'sql-database' })),
      'An Azure service sits in a region, a subnet, a VNet or Azure global services',
    ],
    [
      'a TRM server link on a person',
      (d) =>
        d.boxes.push(box('p', 'person', 'office', { server: { id: SERVER } })),
      'Only a server links to a TRM server',
    ],
    [
      'a TRM application link on a server',
      (d) =>
        d.boxes.push(
          box('s', 'server', 'office', {
            application: { id: POLICY, number: null },
          }),
        ),
      'Only a business application block links to TRM',
    ],
    [
      'a removed data centre',
      (d) => (d.zones = d.zones.filter((z) => z.id !== 'dr-dc')),
      'The infrastructure diagram keeps its subscription, primary and DR regions, PDC, SDC and office network',
    ],
    [
      'a second subscription',
      (d) => d.zones.push(zone('s2', 'subscription')),
      'The infrastructure diagram keeps its subscription, primary and DR regions, PDC, SDC and office network',
    ],
    [
      'a hosting name on the wrong kind of zone',
      (d) => (d.zones[3].kind = 'office'),
      'The infrastructure diagram keeps its subscription, primary and DR regions, PDC, SDC and office network',
    ],
    [
      'two Internet zones',
      (d) => d.zones.push(zone('i2', 'internet')),
      'At most one Internet, Azure global services and 3rd party zone',
    ],
    [
      'an own name on a zone the hosting settings do not name',
      (d) => d.zones.push(zone('v2', 'vnet', 'dr-region', { ownName: true })),
      'Only a zone named by the hosting settings has its own name',
    ],
    [
      'the same primary and DR region',
      (_, c) => (c.hosting.drRegion = 'southeastasia'),
      'The DR region must differ from the primary region',
    ],
    [
      'the same primary and DR data centre',
      (_, c) => (c.hosting.drDc = 'PDC'),
      'The DR data centre must differ from the primary one',
    ],
    [
      'a region Azure does not have',
      (_, c) =>
        ((c.hosting as { primaryRegion: string }).primaryRegion = 'moon'),
      'Invalid option: expected one of',
    ],
  ])('refuses %s', (_, edit, message) => {
    expect(change(edit).join(' | ')).toContain(message);
  });

  it('needs the hosting settings, which only the infrastructure diagram has', () => {
    const { hosting: _, ...withoutHosting } = fresh();
    expect(messages(withoutHosting)).toContain(
      'Invalid input: expected object, received undefined',
    );
    const monitoring = {
      diagrams: [
        {
          id: 'm',
          title: 'Monitoring',
          sizing: 'auto',
          zones: [
            zone('z', 'Logs', undefined, {
              hosting: 'subscription',
              ownName: true,
            }),
          ],
          boxes: [box('b', 'monitoring', 'z', { server: { id: SERVER } })],
          lines: [],
        },
      ],
    };
    expect(messages(monitoring, 'monitoring')).toEqual([
      'Only the infrastructure diagram has this',
      'Only the infrastructure diagram has this',
    ]);
    expect(
      messages({ ...monitoring, hosting: DEFAULT_HOSTING }, 'monitoring'),
    ).toContain('Unrecognized key: "hosting"');
  });
});

describe('hosting names', () => {
  it('names the zones from the hosting settings (regions by their Azure name), except zones changed for one diagram', () => {
    const content = drawn();
    content.hosting = {
      ...content.hosting,
      subscription: 'MY02',
      primaryRegion: 'malaysiawest',
      officeNetwork: 'Menara AIA',
    };
    content.diagrams[1].zones[3] = {
      ...content.diagrams[1].zones[3],
      label: 'PDC (Cyberjaya)',
      ownName: true,
    };
    const named = applyHosting(content) as Drawn;
    expect(named.diagrams[0].zones.slice(0, 6).map((z) => z.label)).toEqual([
      'MY02',
      'Malaysia West',
      'East Asia',
      'PDC',
      'SDC',
      'Menara AIA',
    ]);
    expect(named.diagrams[1].zones[3].label).toBe('PDC (Cyberjaya)');
    expect(named.diagrams[0].zones[6].label).toBe('vnet');
    const notApplicable: DiagramContent = {
      notApplicable: true,
      reason: 'SaaS',
    };
    expect(applyHosting(notApplicable)).toBe(notApplicable);
    const monitoring: DiagramContent = { diagrams: [] };
    expect(applyHosting(monitoring)).toBe(monitoring);
  });
});

describe('diagrams drawn before the hosting settings', () => {
  it('get the given settings; others are left as they are', () => {
    const { hosting: _, ...older } = fresh();
    expect(
      withHosting('infrastructure', older, {
        ...DEFAULT_HOSTING,
        subscription: 'MY02',
      }),
    ).toEqual({
      ...older,
      hosting: { ...DEFAULT_HOSTING, subscription: 'MY02' },
    });
    const current = fresh();
    expect(withHosting('infrastructure', current, DEFAULT_HOSTING)).toBe(
      current,
    );
    const notApplicable: DiagramContent = {
      notApplicable: true,
      reason: 'SaaS',
    };
    expect(withHosting('infrastructure', notApplicable, DEFAULT_HOSTING)).toBe(
      notApplicable,
    );
    const monitoring: DiagramContent = { diagrams: [] };
    expect(withHosting('monitoring', monitoring, DEFAULT_HOSTING)).toBe(
      monitoring,
    );
  });
});

describe('servers picked from TRM', () => {
  it('finds servers newly linked, and keeps the name a server was picked with', () => {
    const before = drawn();
    expect(newPicks(before, drawn(), 'server')).toEqual([]);
    const after = drawn();
    after.diagrams[0].boxes[0] = {
      ...after.diagrams[0].boxes[0],
      label: 'Typed over',
    };
    after.diagrams[1].boxes.push(
      box('np', 'server', 'primary-dc', {
        label: 'anything',
        server: { id: SERVER },
      }) as Diagram['boxes'][number],
    );
    expect(newPicks(before, after, 'server')).toEqual([
      { path: ['diagrams', 1, 'boxes', 0, 'server', 'id'], id: SERVER },
    ]);
    const settled = settlePicks(
      before,
      after,
      new Map([[SERVER, { name: 'SRV-CRM-01', number: null }]]),
      'server',
    ) as Drawn;
    expect(settled.diagrams[0].boxes[0]).toMatchObject({
      label: 'srv',
      server: { id: SERVER },
    });
    expect(settled.diagrams[1].boxes[0]).toEqual({
      ...after.diagrams[1].boxes[0],
      label: 'SRV-CRM-01',
      server: { id: SERVER },
    });
  });
});
