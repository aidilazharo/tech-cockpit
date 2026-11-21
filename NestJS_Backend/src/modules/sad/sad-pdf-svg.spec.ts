import { describe, expect, it } from 'vitest';
import type { Box, Diagram, Line, Zone } from './domain/diagrams.js';
import type { IconSvg } from './sad-pdf-icons.js';
import { diagramSvg, textWidth, wrap } from './sad-pdf-svg.js';

const ICON: IconSvg = { viewBox: '0 0 18 18', body: '<path id="app-services-a" d="M0 0h18v18z"/>' };
const icons = (id: string) => (id === 'app-services' ? ICON : null);

const zone = (id: string, overrides: Partial<Zone> = {}): Zone => ({ id, label: id, x: 0, y: 0, width: 400, height: 300, ...overrides });
const box = (id: string, overrides: Partial<Box> = {}): Box => ({ id, label: id, type: 'part', x: 0, y: 0, ...overrides });
const line = (id: string, from: string, to: string, overrides: Partial<Line> = {}): Line => ({ id, from, to, ...overrides });
const diagram = (overrides: Partial<Diagram>): Diagram => ({ id: 'd', title: 'D', sizing: 'auto', zones: [], boxes: [], lines: [], ...overrides });
/** The `d` of every line, in order. */
const paths = (svg: string) => [...svg.matchAll(/<path d="(M[^"]+)" fill="none"/g)].map((m) => m[1]);

describe('text in a drawing', () => {
  it('measures text a little generously, wider when bold or larger', () => {
    expect(textWidth('', 14)).toBe(0);
    expect(textWidth('Policy Admin', 14)).toBeGreaterThan(70);
    expect(textWidth('Policy Admin', 14, true)).toBeGreaterThan(textWidth('Policy Admin', 14));
    expect(textWidth('WWW', 12)).toBeGreaterThan(textWidth('iii', 12) * 2);
    expect(textWidth('ABC 123', 12)).toBeGreaterThan(textWidth('abc 123', 12));
  });

  it('wraps words onto lines, cutting a word too long for a line and ending with … when lines run out', () => {
    expect(wrap('Customer portal', 200, 14, true, 2)).toEqual(['Customer portal']);
    expect(wrap('Customer self-service portal for agents', 112, 14, true, 2)).toEqual(['Customer', 'self-service…']);
    expect(wrap('Supercalifragilisticexpialidocious', 112, 14, true, 2)).toEqual([expect.stringMatching(/^Supercalif.*…$/)]);
    expect(wrap('a b', 112, 14, true, 2)).toEqual(['a b']);
    expect(wrap('one two three four', 40, 12, false, 1)).toEqual([expect.stringMatching(/^one.*…$/)]);
    expect(wrap('  ', 112, 14, true, 2)).toEqual([]);
  });
});

describe('a diagram drawn by the server', () => {
  it('places zones and boxes where the canvas does (inside their parents), sized to fit, parents first', () => {
    const picture = diagramSvg(
      diagram({
        zones: [zone('inner', { parentId: 'outer', x: 20, y: 40, width: 220, height: 150 }), zone('outer', { label: 'MY01', kind: 'subscription', x: -10, y: -20 })],
        boxes: [box('vm', { label: 'vm-crm-01', type: 'server', parentId: 'inner', x: 20, y: 40 })],
      }),
      'infrastructure',
      'infrastructure',
      icons,
    );
    expect(picture.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" xmlns:xlink="http:\/\/www.w3.org\/1999\/xlink" width="448" height="348" viewBox="0 0 448 348">/);
    expect(picture).toMatchObject({ width: 448, height: 348 });
    expect(picture.svg).toContain('<g transform="translate(34 44)">');
    expect(picture.svg.indexOf('<rect x="-10" y="-20" width="400" height="300"')).toBeLessThan(picture.svg.indexOf('<rect x="10" y="20" width="220" height="150"'));
    expect(picture.svg).toContain('<rect x="30" y="60" width="176" height="64" rx="8"');
    expect(picture.svg).toContain('>MY01</text>');
    expect(picture.svg).toContain('>Subscription</text>');
    expect(picture.svg).toContain('>vm-crm-01</text>');
    expect(picture.svg).toContain('>Server / VM</text>');
    // Only an empty zone says so.
    expect(picture.svg.match(/Nothing drawn yet/g)).toBeNull();
  });

  it('says when a zone or the whole diagram is empty', () => {
    expect(diagramSvg(diagram({ zones: [zone('z', { kind: 'This application' })] }), 'solution', 'solution', icons).svg).toContain('>· Nothing drawn yet.</text>');
    const empty = diagramSvg(diagram({}), 'monitoring', 'monitoring', icons);
    expect(empty).toMatchObject({ width: 360, height: 60 });
    expect(empty.svg).toContain('>Nothing drawn yet.</text>');
  });

  it('draws a box with its Azure icon or its shape, people rounded and external parties dashed, and escapes text', () => {
    const { svg } = diagramSvg(
      diagram({
        boxes: [
          box('web', { label: 'Portal <B&B> "x" \'y\'', icon: 'app-services' }),
          box('actor', { type: 'actor', x: 300 }),
          box('bank', { type: 'external', x: 600 }),
          box('lost', { type: 'business', icon: 'monitor', x: 900 }),
        ],
      }),
      'solution',
      'solution',
      icons,
    );
    expect(svg).toContain('<svg x="12" y="16" width="32" height="32" viewBox="0 0 18 18"><path id="app-services-a" d="M0 0h18v18z"/></svg>');
    expect(svg).toContain('>Portal &lt;B&amp;B&gt;</text>');
    expect(svg).toContain('>&quot;x&quot; &apos;y&apos;</text>');
    expect(svg).toMatch(/>App Services · [^<]*…<\/text>/);
    expect(svg).toContain('<rect x="300" y="0" width="176" height="64" rx="32"');
    expect(svg).toMatch(/<rect x="600" y="0" width="176" height="64" rx="8" fill="#FFFFFF" stroke="#8A8A8A" stroke-width="1" stroke-dasharray="4 3"\/>/);
    // A person, a globe for the external party, and a window for a business application whose icon could not be read.
    expect(svg).toContain('<circle cx="12" cy="8" r="4"/>');
    expect(svg).toContain('<circle cx="12" cy="12" r="9"/>');
    expect(svg).toContain('<path d="M3 9h18M7 13h6M7 16h10"/>');
  });

  it('draws CI and CD steps by kind: rounded Start and End, a diamond Decision, a double-bordered Approval with its seal', () => {
    const { svg } = diagramSvg(
      diagram({
        zones: [zone('lane', { label: 'Azure DevOps', kind: 'lane', width: 1200, height: 120 })],
        boxes: [
          box('start', { type: 'start', label: 'Start', parentId: 'lane', x: 20, y: 40 }),
          box('ok', { type: 'decision', label: 'Tests pass?', parentId: 'lane', x: 220, y: 40 }),
          box('cab', { type: 'approval', label: 'Release', approver: 'CAB', parentId: 'lane', x: 420, y: 40 }),
          box('who', { type: 'approval', label: 'Sign-off', parentId: 'lane', x: 620, y: 40 }),
          box('deploy', { type: 'step', label: 'Deploy', parentId: 'lane', x: 820, y: 40, icon: 'app-services' }),
        ],
      }),
      'ci-cd',
      'process',
      icons,
    );
    expect(svg).toContain('>Lane</text>');
    expect(svg).toContain('<rect x="20" y="40" width="176" height="64" rx="32" fill="#FFFFFF" stroke="#8A8A8A"');
    expect(svg).toContain('<polygon points="308,41 395,72 308,103 221,72"');
    expect(svg).toContain('<rect x="423" y="43" width="170" height="58" rx="6"');
    expect(svg).toContain('>Approval · CAB</text>');
    expect(svg).toContain('M12 2.5l2.3 1.7');
    // Who approves is missing: a warning sign beside the kind.
    expect(svg).toMatch(/>Approval · who[^<]*<\/text>/);
    expect(svg.match(/fill="#F5B400"/g)).toHaveLength(1);
    expect(svg).toContain('<svg x="836" y="60" width="24" height="24" viewBox="0 0 18 18">');
  });

  it('draws lines from side to side with right-angle bends and arrowheads (both ends when two-way), dashed when asked', () => {
    const { svg } = diagramSvg(
      diagram({
        boxes: [box('a'), box('b', { x: 400 }), box('c', { x: 400, y: 200 }), box('d', { y: 300 })],
        lines: [
          line('ab', 'a', 'b', { twoWay: true }),
          line('ac', 'a', 'c', { dashed: true }),
          line('ad', 'a', 'd', { fromSide: 'l', toSide: 'l' }),
          line('cd', 'c', 'd', { fromSide: 'b', toSide: 't' }),
          line('dc', 'd', 'c', { fromSide: 't', toSide: 'r' }),
        ],
      }),
      'monitoring',
      'monitoring',
      icons,
    );
    expect(paths(svg)).toEqual(['M176 32 L400 32', 'M176 32 L288 32 L288 232 L400 232', 'M0 32 L-20 32 L-20 332 L0 332', 'M488 264 L488 282 L88 282 L88 300', 'M88 300 L88 280 L596 280 L596 232 L576 232']);
    expect(svg).toContain('stroke-dasharray="6 4"');
    // Two arrowheads on the two-way line, one on each other line.
    expect(svg.match(/<polygon points="[^"]+" fill="#3D3D3D"\/>/g)).toHaveLength(6);
    expect(svg).toContain('<polygon points="400,32 392,27.5 392,36.5" fill="#3D3D3D"/>');
    expect(svg).toContain('<polygon points="176,32 184,36.5 184,27.5" fill="#3D3D3D"/>');
  });

  it('routes lines between sides facing the same way, facing away, or at right angles', () => {
    const { svg } = diagramSvg(
      diagram({
        boxes: [box('a'), box('b', { x: 400, y: 200 })],
        lines: [
          line('rr', 'a', 'b', { fromSide: 'r', toSide: 'r' }),
          line('bb', 'a', 'b', { fromSide: 'b', toSide: 'b' }),
          line('lr', 'a', 'b', { fromSide: 'l', toSide: 'r' }),
          line('tb', 'a', 'b', { fromSide: 't', toSide: 'b' }),
          line('rt', 'a', 'b', { fromSide: 'r', toSide: 't' }),
          line('back', 'b', 'a', { fromSide: 'r', toSide: 't' }),
          line('bl', 'a', 'b', { fromSide: 'b', toSide: 'l' }),
        ],
      }),
      'monitoring',
      'monitoring',
      icons,
    );
    expect(paths(svg)).toEqual([
      'M176 32 L596 32 L596 232 L576 232',
      'M88 64 L88 284 L488 284 L488 264',
      'M0 32 L-20 32 L-20 132 L596 132 L596 232 L576 232',
      'M88 0 L88 -20 L288 -20 L288 284 L488 284 L488 264',
      'M176 32 L488 32 L488 200',
      'M576 232 L596 232 L596 -20 L88 -20 L88 0',
      'M88 64 L88 232 L400 232',
    ]);
  });

  it('spreads lines between the same sides of the same two things so none is drawn over another', () => {
    expect(paths(diagramSvg(diagram({ boxes: [box('a'), box('c', { y: 300 })], lines: [line('one', 'a', 'c'), line('two', 'a', 'c')] }), 'monitoring', 'monitoring', icons).svg)).toEqual(['M72 64 L72 300', 'M104 64 L104 300']);
    const { svg } = diagramSvg(diagram({ boxes: [box('a'), box('b', { x: 400 })], lines: [line('one', 'a', 'b'), line('two', 'b', 'a')] }), 'monitoring', 'monitoring', icons);
    expect(paths(svg)).toEqual(['M176 16 L400 16', 'M400 48 L176 48']);
  });

  it('labels lines as the view says, with a warning when facts are missing or TLS is not compliant', () => {
    const solution = diagram({ boxes: [box('a'), box('b', { x: 400 })], lines: [line('ab', 'a', 'b', { calls: 'Policy API', does: 'Creates' }), line('ba', 'b', 'a')] });
    const shown = diagramSvg(solution, 'solution', 'solution', icons).svg;
    expect(shown).toContain('>Policy API</text>');
    expect(shown).toContain('>Not described yet</text>');
    expect(shown.match(/fill="#F5B400"/g)).toHaveLength(1);
    expect(diagramSvg(solution, 'solution', 'data-flow', icons).svg.match(/>No data objects<\/text>/g)).toHaveLength(2);

    const infrastructure = diagram({
      boxes: [box('a', { type: 'server' }), box('b', { type: 'server', x: 400 })],
      lines: [
        line('wan', 'a', 'b', { label: 'Replication' }),
        line('api', 'a', 'b', {
          layer: 'integration',
          protocol: 'HTTPS',
          port: 443,
          tls: '1.0',
          pattern: 'web-ui',
          authentication: 'SSO',
          classification: 'internal',
          purpose: 'Use',
          flow: 'end-user',
        }),
      ],
    });
    const lines = diagramSvg(infrastructure, 'infrastructure', 'infrastructure', icons).svg;
    expect(lines).toContain('>Replication</text>');
    expect(lines).not.toContain('HTTPS');
    const integration = diagramSvg(infrastructure, 'infrastructure', 'integration', icons).svg;
    expect(integration).toContain('>HTTPS 443 · TLS 1.0</text>');
    expect(integration).not.toContain('Replication');
    expect(integration.match(/fill="#F5B400"/g)).toHaveLength(1);
  });

  it('keeps long line labels to three lines, and leaves room for a label beyond the boxes', () => {
    const picture = diagramSvg(
      diagram({ boxes: [box('a'), box('b', { x: 200 })], lines: [line('ab', 'a', 'b', { fromSide: 't', toSide: 't', label: Array.from({ length: 40 }, () => 'word').join(' ') })] }),
      'monitoring',
      'monitoring',
      icons,
    );
    expect(picture.svg.match(/font-size="12" fill="#1F1F1F">word/g)).toHaveLength(3);
    expect(picture.svg).toMatch(/…<\/text>/);
    expect(picture.height).toBeGreaterThan(64 + 48 + 20);
  });
});
