import { describe, expect, it } from 'vitest';
import { AZURE_ICON_IDS } from './domain/azure-icons.js';
import { azureIconSvg, iconParts } from './sad-pdf-icons.js';

describe("the API's copy of Microsoft's Azure icons, for drawing them in PDFs", () => {
  it('has every icon a box may show, each with its picture area', () => {
    for (const id of AZURE_ICON_IDS) expect(azureIconSvg(id)?.viewBox, id).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
  });

  it('gives the inside of an icon with its own ids, so several icons in one drawing never share a gradient', () => {
    const icon = azureIconSvg('app-services')!;
    expect(icon.viewBox).toBe('0 0 18 18');
    expect(icon.body).not.toContain('<svg');
    expect(icon.body).not.toContain('<title>');
    expect(icon.body).toContain('id="app-services-e2cf8746-c9a8-4eee-86c2-4951983c6032"');
    expect(icon.body).toContain('fill="url(#app-services-e2cf8746-c9a8-4eee-86c2-4951983c6032)"');
    expect(azureIconSvg('app-services')).toBe(icon);
  });

  it('renames links to its own parts too', () => {
    const { viewBox, body } = iconParts('x', '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><title>t</title><defs><linearGradient id="a"/><linearGradient id="b" xlink:href="#a"/></defs><path fill="url(#b)"/></svg>');
    expect(viewBox).toBe('0 0 18 18');
    expect(body).toBe('<defs><linearGradient id="x-a"/><linearGradient id="x-b" xlink:href="#x-a"/></defs><path fill="url(#x-b)"/>');
  });

  it('reads nothing for an id that is not in the set', () => {
    expect(azureIconSvg('../../../package')).toBeNull();
    expect(azureIconSvg('not-an-icon')).toBeNull();
  });
});
