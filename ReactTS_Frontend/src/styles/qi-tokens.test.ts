import { readFileSync } from 'node:fs'
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildQiCss } from '../../scripts/qi-tokens.mjs';
import tokens from '../../design-tokens/qi-tokens.json';

type Palette = Record<string, string>;
const light = tokens.light as Palette;
const dark = tokens.dark as Palette;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('generated Qi token CSS', () => {
  it('is up to date with design-tokens/qi-tokens.json (run npm run tokens)', () => {
    const committed = readFileSync(join(process.cwd(), 'src/styles/qi-tokens.css'), 'utf8');
    expect(committed).toBe(buildQiCss(tokens));
  });

  it('defines a dark value for every light token', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('rejects a token document with a missing dark value', () => {
    const broken = { ...tokens, dark: { ...dark } } as typeof tokens;
    delete (broken.dark as Palette)['text-default'];
    expect(() => buildQiCss(broken)).toThrow(/text-default/);
  });

  it('rejects a token document with a missing radius token', () => {
    const broken = { ...tokens, shape: { ...tokens.shape } } as typeof tokens;
    delete (broken.shape as Record<string, string>)['card-radius'];
    expect(() => buildQiCss(broken)).toThrow(/card-radius/);
  });
});

describe('Qi colour contrast (WCAG 2.2 AA)', () => {
  // Text pairs used by the component library must reach 4.5:1.
  const textPairs: Array<[string, string]> = [
    ['text-default', 'surface-default'],
    ['text-default', 'surface-alternate'],
    ['text-subdued', 'surface-default'],
    ['text-subdued', 'surface-alternate'],
    ['text-link', 'surface-default'],
    ['text-error', 'surface-default'],
    ['text-positive', 'surface-default'],
    ['button-primary-text', 'button-primary-surface'],
    ['button-primary-text', 'button-primary-surface-hover'],
    ['text-default', 'surface-overlay'],
    ['tag-default-text', 'tag-default-surface'],
    ['tag-mediumemphasis-text', 'tag-mediumemphasis-surface'],
  ];
  // Component boundaries and focus indicators must reach 3:1.
  const uiPairs: Array<[string, string]> = [
    ['border-default', 'surface-default'],
    ['icon-success', 'surface-default'],
    ['icon-error', 'surface-default'],
  ];

  it.each(textPairs)('light: %s on %s >= 4.5', (fg, bg) => {
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(textPairs)('dark: %s on %s >= 4.5', (fg, bg) => {
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(uiPairs)('light: %s on %s >= 3', (fg, bg) => {
    expect(contrast(light[fg], light[bg])).toBeGreaterThanOrEqual(3);
  });

  it('focus ring is visible in both themes (>= 3:1)', () => {
    expect(contrast(light['border-focus'], light['surface-default'])).toBeGreaterThanOrEqual(3);
    expect(contrast(dark['border-focus'], dark['surface-default'])).toBeGreaterThanOrEqual(3);
  });

  it('documents the known gap: warning yellow alone fails on white, so RAG amber needs an outline', () => {
    expect(contrast(light['icon-warning'], light['surface-default'])).toBeLessThan(3);
    expect(contrast(light['icon-warning'], light['icon-default'])).toBeGreaterThanOrEqual(3);
  });
});
