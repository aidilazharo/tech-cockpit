import type { Content } from 'pdfmake/interfaces.js';
import { describe, expect, it } from 'vitest';
import type { Box, Diagram, DiagramContent, Line, Zone } from './domain/diagrams.js';
import { diagramPages, type PdfDiagrams, type PdfDiagramSlot, type PdfUpload } from './sad-pdf-diagrams.js';

const API = '00000000-0000-4000-8000-0000000000a1';
const icons = () => null;
const zone = (id: string, overrides: Partial<Zone> = {}): Zone => ({ id, label: id, x: 0, y: 0, width: 400, height: 300, ...overrides });
const box = (id: string, overrides: Partial<Box> = {}): Box => ({ id, label: id, type: 'part', x: 0, y: 0, ...overrides });
const line = (id: string, from: string, to: string, overrides: Partial<Line> = {}): Line => ({ id, from, to, ...overrides });
const diagram = (id: string, overrides: Partial<Diagram> = {}): Diagram => ({ id, title: id, sizing: 'auto', zones: [], boxes: [], lines: [], ...overrides });
const upload = (overrides: Partial<PdfUpload> = {}): PdfUpload => ({
  slot: 'solution',
  diagramId: 'solution',
  name: 'Design v2.pdf',
  type: 'pdf',
  size: 2_621_440,
  scan: 'clean',
  uploadedBy: { name: 'Ada Lim' },
  uploadedAt: '2026-10-24T17:30:00Z',
  ...overrides,
});
const data = (slots: PdfDiagramSlot[], extra: Partial<PdfDiagrams> = {}): PdfDiagrams => ({ slots, apis: [], uploads: [], ...extra });

/** The rows of the table under a caption on a page, as text; or the note shown instead when it is empty. */
function rowsUnder(content: Content[], caption: string): string[][] | string {
  const at = content.findIndex((item) => (item as { text?: unknown }).text === caption);
  expect(at, `no "${caption}"`).toBeGreaterThanOrEqual(0);
  const next = content[at + 1] as { table?: { body: unknown[][] }; text?: string };
  if (!next.table) return next.text!;
  return next.table.body.map((row) => row.map((cell) => (typeof cell === 'string' ? cell : (cell as { text: string }).text)));
}
const flat = (value: unknown) => JSON.stringify(value);

const solution: DiagramContent = {
  diagrams: [
    diagram('solution', {
      zones: [zone('own', { label: 'CRM', kind: 'This application' })],
      boxes: [box('portal', { label: 'Portal', parentId: 'own', x: 20, y: 40 }), box('agent', { label: 'Agent', type: 'actor', x: -300 })],
      lines: [line('l1', 'agent', 'portal', { calls: 'Portal UI', does: 'Serves agents', data: 'Policy\nCustomer', classification: 'confidential', frequency: 'Daily' }), line('l2', 'portal', 'agent')],
    }),
  ],
};

describe('a diagram in the SAD PDF', () => {
  it('gives the solution diagram its own landscape page: the drawing, its tables, the logical matrix and its files', () => {
    const pages = diagramPages({ slot: 'solution', view: 'solution' }, 'solution-integration', data([{ slot: 'solution', owner: 'solution-integration', readableViews: ['solution', 'data-flow'], content: solution }], { uploads: [upload(), upload({ slot: 'monitoring', diagramId: 'solution', name: 'other.pdf' })] }), icons);
    expect(pages).toHaveLength(1);
    const [{ landscape, content }] = pages;
    expect(landscape).toBe(true);
    expect(content[0]).toEqual({ text: 'Solution diagram', style: 'h3' });
    const picture = content[1] as { svg: string; width: number; height: number };
    expect(picture.svg).toMatch(/^<svg /);
    // At the canvas's full size (0.75 pt a pixel) when it fits.
    expect(picture.width).toBe(0.75 * Number(/width="(\d+)"/.exec(picture.svg)![1]));
    expect(rowsUnder(content, 'Grouping boxes')).toEqual([
      ['Name', 'Kind', 'Inside'],
      ['CRM', 'This application', '—'],
    ]);
    expect(rowsUnder(content, 'Blocks')).toEqual([
      ['Name', 'Type', 'Inside'],
      ['Portal', 'Part of this application', 'CRM'],
      ['Agent', 'Actor', '—'],
    ]);
    expect(rowsUnder(content, 'Connections')).toEqual([
      ['From', 'To', 'What it calls', 'What it does', 'Direction'],
      ['Agent', 'Portal', 'Portal UI', 'Serves agents', 'One-way'],
      ['Portal', 'Agent', '—', '—', 'One-way'],
    ]);
    expect(rowsUnder(content, 'Logical communication matrix')).toEqual([
      ['Source', 'Destination', 'What it calls', 'What it does', 'Direction', 'Data objects and key attributes', 'Classification', 'Frequency / volume'],
      ['Agent', 'Portal', 'Portal UI', 'Serves agents', 'One-way', 'Policy; Customer', 'Confidential', 'Daily'],
      ['Portal', 'Agent', '—', '—', 'One-way', '—', '—', '—'],
    ]);
    expect(rowsUnder(content, 'Files (1 of 20)')).toEqual([
      ['Name', 'Type', 'Size', 'Uploaded by', 'Uploaded', 'Malware check'],
      ['Design v2.pdf', 'PDF', '2.5 MB', 'Ada Lim', '25/10/2026', '—'],
    ]);
    expect(flat(content)).not.toContain('Drawn in');
  });

  it('leaves the data columns out of the logical matrix for readers who cannot read section 9', () => {
    const [{ content }] = diagramPages({ slot: 'solution', view: 'solution' }, 'solution-integration', data([{ slot: 'solution', owner: 'solution-integration', readableViews: ['solution'], content: solution }]), icons);
    expect((rowsUnder(content, 'Logical communication matrix') as string[][])[0]).toEqual(['Source', 'Destination', 'What it calls', 'What it does', 'Direction']);
    // The PDF's font has no arrow: From and To are two columns.
    expect(flat(content)).not.toContain('→');
    expect(rowsUnder(content, 'Files (0 of 20)')).toBe('No files under this diagram.');
  });

  it('shows the data flow view in section 9 with its own facts, naming the section that draws it', () => {
    const view = (readableViews: PdfDiagramSlot['readableViews']) =>
      diagramPages({ slot: 'solution', view: 'data-flow' }, 'data-architecture', data([{ slot: 'solution', owner: 'solution-integration', readableViews, content: solution }]), icons)[0].content;
    const both = view(['solution', 'data-flow']);
    expect(both[0]).toEqual({ text: 'Solution diagram: Data flow view', style: 'h3' });
    expect(both[1]).toMatchObject({ text: 'Drawn in “Solution & Integration Architecture”.' });
    expect(flat(both)).not.toContain('Grouping boxes');
    expect(flat(both)).not.toContain('Logical communication matrix');
    expect(rowsUnder(both, 'Connections')).toEqual([
      ['From', 'To', 'What it calls', 'Data objects and key attributes', 'Classification', 'Frequency / volume'],
      ['Agent', 'Portal', 'Portal UI', 'Policy; Customer', 'Confidential', 'Daily'],
      ['Portal', 'Agent', '—', '—', '—', '—'],
    ]);
    // Without section 2, what a connection calls is not shown.
    expect((rowsUnder(view(['data-flow']), 'Connections') as string[][])[0]).toEqual(['From', 'To', 'Data objects and key attributes', 'Classification', 'Frequency / volume']);
  });

  const infrastructure: DiagramContent = {
    hosting: { subscription: 'MY01', primaryRegion: 'southeastasia', drRegion: 'eastasia', primaryDc: 'PDC', drDc: 'SDC', officeNetwork: 'Office network' },
    diagrams: [
      diagram('production', {
        title: 'Production',
        tab: 'production',
        zones: [zone('subscription', { label: 'MY01-prod', kind: 'subscription', hosting: 'subscription', ownName: true }), zone('vnet', { label: 'vnet-crm', kind: 'vnet', parentId: 'subscription', x: 20, y: 40, width: 300, height: 200 })],
        boxes: [box('vm', { label: 'vm-01', type: 'server', parentId: 'vnet', x: 20, y: 40 }), box('bank', { label: 'Bank', type: 'external', x: 600 })],
        lines: [
          line('rep', 'vm', 'bank', { label: 'WAN', dashed: true }),
          line('link', 'bank', 'vm'),
          line('api', 'vm', 'bank', {
            layer: 'integration',
            protocol: 'HTTPS',
            port: 443,
            tls: '1.1',
            pattern: 'api',
            api: { id: API },
            authentication: 'mTLS',
            classification: 'internal',
            purpose: 'Payments',
            flow: 'service',
            twoWay: true,
          }),
        ],
      }),
      diagram('non-production', { title: 'Non-production', tab: 'non-production' }),
    ],
  };
  const infraSlot: PdfDiagramSlot = { slot: 'infrastructure', owner: 'network', readableViews: ['infrastructure', 'integration'], content: infrastructure };

  it('gives each infrastructure tab its own page in the Infrastructure view, with renamed zones marked', () => {
    const uploads = [upload({ slot: 'infrastructure', diagramId: 'non-production', uploadedBy: null, scan: 'scanning', size: 900 }), upload({ slot: 'infrastructure', diagramId: 'non-production', name: 'sizing.xlsx', type: 'xlsx', scan: 'failed', size: 5000 })];
    const pages = diagramPages({ slot: 'infrastructure', view: 'infrastructure' }, 'network', data([infraSlot], { uploads }), icons);
    expect(pages.map((page) => [page.landscape, (page.content[0] as { text: string }).text])).toEqual([
      [true, 'Infrastructure diagram — Production'],
      [true, 'Infrastructure diagram — Non-production'],
    ]);
    const [production, nonProduction] = pages.map((page) => page.content);
    expect(rowsUnder(production, 'Zones')).toEqual([
      ['Name', 'Kind', 'Inside'],
      ['MY01-prod', 'Subscription · name changed for this diagram', '—'],
      ['vnet-crm', 'VNet', 'MY01-prod'],
    ]);
    expect(rowsUnder(production, 'Boxes')).toEqual([
      ['Name', 'Kind', 'Inside'],
      ['vm-01', 'Server / VM', 'vnet-crm'],
      ['Bank', 'External party', '—'],
    ]);
    expect(rowsUnder(production, 'Lines')).toEqual([
      ['From', 'To', 'Label', 'Style'],
      ['vm-01', 'Bank', 'WAN', 'Dashed · One-way'],
      ['Bank', 'vm-01', '—', 'Solid · One-way'],
    ]);
    expect(rowsUnder(nonProduction, 'Zones')).toBe('No zones yet.');
    expect(rowsUnder(nonProduction, 'Boxes')).toBe('No boxes yet.');
    expect(rowsUnder(nonProduction, 'Lines')).toBe('No lines yet.');
    expect(rowsUnder(nonProduction, 'Files (2 of 20)')).toEqual([
      ['Name', 'Type', 'Size', 'Uploaded by', 'Uploaded', 'Malware check'],
      ['Design v2.pdf', 'PDF', '900 B', 'Restricted', '25/10/2026', 'Being checked for malware'],
      ['sizing.xlsx', 'XLSX', '5 KB', 'Ada Lim', '25/10/2026', 'Could not be checked for malware'],
    ]);
    // Section 4 shows the same view read-only, drawn in section 3.
    expect(diagramPages({ slot: 'infrastructure', view: 'infrastructure' }, 'resiliency', data([infraSlot]), icons)[0].content[1]).toMatchObject({ text: 'Drawn in “Physical and Network Architecture”.' });
  });

  it('shows the Integration view of both tabs with their connections, then the technical matrix', () => {
    const pages = diagramPages({ slot: 'infrastructure', view: 'integration' }, 'solution-integration', data([infraSlot], { apis: [{ id: API, name: 'Payments API' }] }), icons);
    expect(pages).toHaveLength(2);
    expect(pages[0].content[0]).toEqual({ text: 'Infrastructure diagram: Integration view — Production', style: 'h3' });
    expect(rowsUnder(pages[0].content, 'Connections')).toEqual([
      ['From', 'To', 'Protocol and port', 'TLS', 'Pattern'],
      ['vm-01', 'Bank', 'HTTPS 443', '1.1 (not compliant)', 'API'],
    ]);
    expect(rowsUnder(pages[1].content, 'Connections')).toBe('No connections yet.');
    expect(flat(pages[0].content)).not.toContain('Technical communication matrix');
    // Fifteen columns fit a landscape page with small type and tight cells.
    const matrix = pages[1].content[pages[1].content.findIndex((item) => (item as { text?: string }).text === 'Technical communication matrix') + 1] as unknown as { fontSize: number; layout: { paddingLeft: () => number } };
    expect(matrix.fontSize).toBe(7);
    expect(matrix.layout.paddingLeft()).toBe(2);
    expect(rowsUnder(pages[1].content, 'Technical communication matrix')).toEqual([
      ['Environment', 'Source', 'Source zone', 'Destination', 'Destination zone', 'Protocol', 'Port', 'TLS', 'Direction', 'Pattern', 'Authentication', 'API', 'Classification', 'Purpose', 'Flow type'],
      ['Production', 'vm-01', 'MY01-prod › vnet-crm', 'Bank', '—', 'HTTPS', '443', '1.1 (not compliant)', 'Two-way', 'API', 'mTLS', 'Payments API', 'Internal', 'Payments', 'Service-to-service'],
    ]);
    const blank = diagramPages(
      { slot: 'infrastructure', view: 'integration' },
      'solution-integration',
      data([{ ...infraSlot, content: { ...infrastructure, diagrams: [diagram('production', { tab: 'production', boxes: [box('a'), box('b', { x: 300 })], lines: [line('c', 'a', 'b', { layer: 'integration' })] }), infrastructure.diagrams[1]] } }]),
      icons,
    );
    expect((rowsUnder(blank[1].content, 'Technical communication matrix') as string[][])[1]).toEqual(['Production', 'a', '—', 'b', '—', '—', '—', '—', 'One-way', '—', '—', '—', '—', '—', '—']);
    expect((rowsUnder(blank[0].content, 'Connections') as string[][])[1]).toEqual(['a', 'b', '—', '—', '—']);
    expect(rowsUnder(diagramPages({ slot: 'infrastructure', view: 'integration' }, 'solution-integration', data([{ ...infraSlot, content: { ...infrastructure, diagrams: [infrastructure.diagrams[1], infrastructure.diagrams[1]] } }]), icons)[1].content, 'Technical communication matrix')).toBe('No connections yet.');
  });

  it('gives each CI and CD flow its own page, with its lanes in order, steps and who approves', () => {
    const flows: DiagramContent = {
      diagrams: [
        diagram('ci-cd-1', {
          title: 'Build',
          zones: [zone('dev', { label: 'Azure DevOps', kind: 'lane' }), zone('cab', { label: 'ServiceNow change', kind: 'lane', y: 320 })],
          boxes: [box('go', { label: 'Start', type: 'start', parentId: 'dev' }), box('ok', { label: 'Approve', type: 'approval', approver: 'CAB', parentId: 'cab' }), box('loose', { label: 'Loose', type: 'step' })],
          lines: [line('l1', 'go', 'ok', { label: 'Yes' })],
        }),
        diagram('ci-cd-2', { title: 'Release' }),
      ],
    };
    const pages = diagramPages({ slot: 'ci-cd', view: 'process' }, 'deployment', data([{ slot: 'ci-cd', owner: 'deployment', readableViews: ['process'], content: flows }]), icons);
    expect(pages.map((page) => (page.content[0] as { text: string }).text)).toEqual(['CI and CD flows — Build', 'CI and CD flows — Release']);
    expect(rowsUnder(pages[0].content, 'Lanes')).toEqual([
      ['Order', 'Name', 'Steps'],
      ['1', 'Azure DevOps', '1'],
      ['2', 'ServiceNow change', '1'],
    ]);
    expect(rowsUnder(pages[0].content, 'Steps')).toEqual([
      ['Name', 'Kind', 'Lane', 'Who approves'],
      ['Start', 'Start', 'Azure DevOps', '—'],
      ['Approve', 'Approval', 'ServiceNow change', 'CAB'],
      ['Loose', 'Step', '—', '—'],
    ]);
    expect(rowsUnder(pages[0].content, 'Connections')).toEqual([
      ['From', 'To', 'Label', 'Style'],
      ['Start', 'Approve', 'Yes', 'Solid · One-way'],
    ]);
    expect(rowsUnder(pages[1].content, 'Lanes')).toBe('No lanes yet.');
    expect(rowsUnder(pages[1].content, 'Steps')).toBe('No steps yet.');
    expect(rowsUnder(pages[1].content, 'Connections')).toBe('No lines yet.');
  });

  it('shows monitoring diagrams with their grouping boxes, blocks and connections', () => {
    const monitoring: DiagramContent = {
      diagrams: [
        diagram('monitoring-1', {
          title: 'Alerts',
          zones: [zone('ops', { label: 'Operations' })],
          boxes: [box('dt', { label: 'Dynatrace', type: 'monitoring' }), box('team', { label: 'Support', type: 'team', parentId: 'ops' })],
          lines: [line('l1', 'dt', 'team', { label: 'Alerts', twoWay: true })],
        }),
      ],
    };
    const [{ content }] = diagramPages({ slot: 'monitoring', view: 'monitoring' }, 'logging', data([{ slot: 'monitoring', owner: 'logging', readableViews: ['monitoring'], content: monitoring }]), icons);
    expect(content[0]).toEqual({ text: 'Monitoring diagram — Alerts', style: 'h3' });
    expect(rowsUnder(content, 'Grouping boxes')).toEqual([
      ['Name', 'Kind', 'Inside'],
      ['Operations', '—', '—'],
    ]);
    expect(rowsUnder(content, 'Blocks')).toEqual([
      ['Name', 'Kind', 'Inside'],
      ['Dynatrace', 'Monitoring service', '—'],
      ['Support', 'Team / person', 'Operations'],
    ]);
    expect(rowsUnder(content, 'Connections')).toEqual([
      ['From', 'To', 'Label', 'Style'],
      ['Dynatrace', 'Support', 'Alerts', 'Solid · Two-way'],
    ]);
    const empty = diagramPages({ slot: 'monitoring', view: 'monitoring' }, 'logging', data([{ slot: 'monitoring', owner: 'logging', readableViews: ['monitoring'], content: { diagrams: [diagram('monitoring-1')] } }]), icons)[0].content;
    expect(rowsUnder(empty, 'Grouping boxes')).toBe('No grouping boxes yet.');
    expect(rowsUnder(empty, 'Blocks')).toBe('No blocks yet.');
  });

  it('shrinks a large drawing to fit the page', () => {
    const wide: DiagramContent = { diagrams: [diagram('solution', { boxes: [box('a'), box('b', { x: 4000, y: 2000 })] })] };
    const picture = diagramPages({ slot: 'solution', view: 'solution' }, 'solution-integration', data([{ slot: 'solution', owner: 'solution-integration', readableViews: ['solution'], content: wide }]), icons)[0].content[1] as { width: number; height: number };
    expect(picture.width).toBeCloseTo(760, 0);
    expect(picture.height).toBeLessThanOrEqual(400);
  });

  it('answers Not applicable with its reason on the portrait page', () => {
    expect(diagramPages({ slot: 'monitoring', view: 'monitoring' }, 'logging', data([{ slot: 'monitoring', owner: 'logging', readableViews: ['monitoring'], content: { notApplicable: true, reason: 'Batch job' } }]), icons)).toEqual([
      { landscape: false, content: [{ text: 'Monitoring diagram', style: 'h3' }, { text: 'Does not apply: Batch job', margin: [0, 0, 0, 8] }] },
    ]);
  });

  it('shows nothing of a diagram the reader cannot see', () => {
    expect(diagramPages({ slot: 'monitoring', view: 'monitoring' }, 'logging', data([]), icons)).toEqual([]);
  });
});
