import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Diagram } from './domain/diagrams.js';
import { buildSadPdf, type PdfVersion } from './sad-pdf.js';
import type { PdfDiagrams } from './sad-pdf-diagrams.js';
import { renderPdf } from './sad-pdf-render.js';

const version: PdfVersion = {
  application: { name: 'CRM', number: 'APM-1' },
  status: 'draft',
  number: null,
  draftOf: 1,
  trm: null,
  sections: [
    { key: 'solution-integration', readable: true, answers: {} },
    { key: 'network', readable: true, answers: {} },
    { key: 'deployment', readable: true, answers: {} },
    { key: 'logging', readable: true, answers: {} },
  ],
  hidden: [],
};
const diagram = (overrides: Partial<Diagram>): Diagram => ({ id: 'd', title: 'D', sizing: 'auto', zones: [], boxes: [], lines: [], ...overrides });

describe('rendering the SAD PDF', () => {
  it('draws every kind of diagram, Azure icons included, on landscape pages between portrait ones', async () => {
    const diagrams: PdfDiagrams = {
      slots: [
        {
          slot: 'solution',
          owner: 'solution-integration',
          readableViews: ['solution', 'data-flow'],
          content: {
            diagrams: [
              diagram({
                id: 'solution',
                zones: [{ id: 'z', label: 'CRM', kind: 'This application', x: 0, y: 0, width: 260, height: 140 }],
                boxes: [
                  { id: 'web', label: 'Portal', type: 'part', icon: 'app-services', parentId: 'z', x: 20, y: 50 },
                  { id: 'ip', label: 'Address', type: 'part', icon: 'public-ip-prefixes', x: 400, y: 50 },
                  { id: 'bank', label: 'Bank', type: 'external', x: 400, y: 250 },
                ],
                lines: [{ id: 'l', from: 'web', to: 'bank', calls: 'Pay', twoWay: true, dashed: true }],
              }),
            ],
          },
        },
        {
          slot: 'ci-cd',
          owner: 'deployment',
          readableViews: ['process'],
          content: {
            diagrams: [
              diagram({
                id: 'ci-cd-1',
                zones: [{ id: 'lane', label: 'Azure DevOps', kind: 'lane', x: 0, y: 0, width: 900, height: 140 }],
                boxes: [
                  { id: 's', label: 'Start', type: 'start', parentId: 'lane', x: 20, y: 50 },
                  { id: 'd', label: 'Pass?', type: 'decision', parentId: 'lane', x: 220, y: 50 },
                  { id: 'a', label: 'Sign-off', type: 'approval', parentId: 'lane', x: 420, y: 50 },
                ],
                lines: [{ id: 'l', from: 's', to: 'd' }],
              }),
            ],
          },
        },
      ],
      apis: [],
      uploads: [],
    };
    const file = await renderPdf(buildSadPdf(version, [], [], new Date('2026-10-25T00:00:00Z'), diagrams));
    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
    const text = file.toString('latin1');
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('renders the rich text formats: headings, decorations, font sizes and tables', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Overview' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'struck', marks: [{ type: 'strike' }, { type: 'underline' }, { type: 'textStyle', attrs: { fontSize: 'large' } }] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Service' }] }] }] }] },
      ],
    };
    const rich = { ...version, sections: [{ key: 'solution-integration', readable: true, answers: { 'solution-overview': { value: doc } } }] };
    const file = await renderPdf(buildSadPdf(rich, [], [], new Date('2026-10-25T00:00:00Z')));
    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('never fetches anything from the network', async () => {
    await expect(renderPdf({ content: [{ image: 'https://example.com/logo.png' }] })).rejects.toThrow();
  });

  it('reads no local file but its fonts, even through a path that climbs out of the fonts folder', async () => {
    const fonts = join(dirname(createRequire(import.meta.url).resolve('pdfmake/package.json')), 'fonts', 'Roboto');
    await expect(renderPdf({ content: [{ image: join(fonts, '..', '..', 'package.json') }] })).rejects.toThrow(/not allowed|access/i);
    await expect(renderPdf({ content: [{ image: `${fonts}/../../package.json` }] })).rejects.toThrow(/not allowed|access/i);
  });
});
