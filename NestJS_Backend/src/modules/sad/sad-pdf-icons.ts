import { readFileSync } from 'node:fs';
import { AZURE_ICON_IDS } from './domain/azure-icons.js';

/**
 * The API's copy of Microsoft's Azure icons (written by ReactTS_Frontend/scripts/generate-azure-icons.mjs, copied into
 * dist by nest-cli.json; terms in azure-icons/NOTICE.md), drawn inside SAD PDF diagrams.
 */
const FOLDER = new URL('./azure-icons/', import.meta.url);

/** An icon's picture area and what is inside its <svg>, ready to place in a larger drawing. */
export interface IconSvg {
  viewBox: string;
  body: string;
}

/** The inside of an icon's SVG with its ids (and the links to them) prefixed, so icons placed together never share one. */
export function iconParts(prefix: string, svg: string): IconSvg {
  const open = /<svg\b[^>]*>/.exec(svg)!;
  return {
    // Every icon in Microsoft's set has one (a test reads them all).
    viewBox: /viewBox="([^"]+)"/.exec(open[0])![1],
    body: svg
      .slice(open.index + open[0].length, svg.lastIndexOf('</svg>'))
      .replace(/<title>[\s\S]*?<\/title>/g, '')
      .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
      .replace(/href="#([^"]+)"/g, `href="#${prefix}-$1"`),
  };
}

const read = new Map<string, IconSvg>();

/** An Azure icon by id, read once; null for an id not in the set (nothing else is ever read). */
export function azureIconSvg(id: string): IconSvg | null {
  if (!AZURE_ICON_IDS.has(id)) return null;
  let icon = read.get(id);
  if (!icon) {
    icon = iconParts(id, readFileSync(new URL(`${id}.svg`, FOLDER), 'utf8'));
    read.set(id, icon);
  }
  return icon;
}
