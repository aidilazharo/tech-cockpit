import { dirname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import pdfmake from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';

// pdfmake reads its bundled Roboto fonts and nothing else: no remote downloads, no other local files. Diagrams are
// SVG built by the server, with the Azure icons placed inside them (sad-pdf-icons.ts), so nothing else is read.
const FONTS = join(dirname(createRequire(import.meta.url).resolve('pdfmake/package.json')), 'fonts', 'Roboto');
pdfmake.setUrlAccessPolicy(() => false);
// Paths are resolved first, so one climbing out of the fonts folder ("../") is refused.
pdfmake.setLocalAccessPolicy((path) => resolve(path).startsWith(FONTS + sep));
pdfmake.setFonts({
  Roboto: {
    normal: join(FONTS, 'Roboto-Regular.ttf'),
    bold: join(FONTS, 'Roboto-Medium.ttf'),
    italics: join(FONTS, 'Roboto-Italic.ttf'),
    bolditalics: join(FONTS, 'Roboto-MediumItalic.ttf'),
  },
});

/** The PDF file of a document definition. */
export const renderPdf = (definition: TDocumentDefinitions): Promise<Buffer> => pdfmake.createPdf(definition).getBuffer();
