import { z } from 'zod';

// Rich text is stored as a small, fixed document tree (the editor's JSON), never as HTML:
// paragraphs, headings (Heading and Subheading: levels 4 and 5, under the page's section and group headings),
// bullet and numbered lists, tables of text, line breaks, bold, italic, underline, strikethrough, a font size
// (small or large; normal has none) and http(s)/mailto links (2026-10-25).
// Unknown attributes are dropped; unknown nodes and marks are refused.

export const FONT_SIZES = ['small', 'large'] as const;
export type RichMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'textStyle'; attrs: { fontSize: (typeof FONT_SIZES)[number] } }
  | { type: 'link'; attrs: { href: string } };
export type RichInline = { type: 'text'; text: string; marks?: RichMark[] } | { type: 'hardBreak' };
export type RichParagraph = { type: 'paragraph'; content?: RichInline[] };
/** What list items hold: paragraphs and lists. */
export type RichListBlock = RichParagraph | { type: 'bulletList'; content: RichListItem[] } | { type: 'orderedList'; attrs?: { start?: number }; content: RichListItem[] };
export interface RichListItem {
  type: 'listItem';
  content: RichListBlock[];
}
/** A table cell holds paragraphs of text. */
export interface RichCell {
  type: 'tableHeader' | 'tableCell';
  content: RichParagraph[];
}
export type RichBlock = RichListBlock | { type: 'heading'; attrs: { level: 4 | 5 }; content?: RichInline[] } | { type: 'table'; content: { type: 'tableRow'; content: RichCell[] }[] };
export interface RichDoc {
  type: 'doc';
  content: RichBlock[];
}

const MAX_DEPTH = 30;
const MAX_TEXT = 20_000;

export const SAFE_URL = /^(https?:\/\/|mailto:)[^\s<>"']+$/i;

const MarkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('underline') }),
  z.object({ type: z.literal('strike') }),
  z.object({ type: z.literal('textStyle'), attrs: z.object({ fontSize: z.enum(FONT_SIZES) }) }),
  z.object({ type: z.literal('link'), attrs: z.object({ href: z.string().max(2000).regex(SAFE_URL, 'Links must start with https://, http:// or mailto:') }) }),
]);
const InlineSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(MAX_TEXT), marks: z.array(MarkSchema).max(6).optional() }),
  z.object({ type: z.literal('hardBreak') }),
]);
const ParagraphSchema = z.object({ type: z.literal('paragraph'), content: z.array(InlineSchema).max(500).optional() });
const ListItemSchema: z.ZodType<RichListItem> = z.lazy(() => z.object({ type: z.literal('listItem'), content: z.array(ListBlockSchema).max(200) }));
const ListSchemas = [
  z.object({ type: z.literal('bulletList'), content: z.array(ListItemSchema).max(200) }),
  z.object({
    type: z.literal('orderedList'),
    attrs: z.object({ start: z.number().int().min(0).max(100_000).optional() }).optional(),
    content: z.array(ListItemSchema).max(200),
  }),
] as const;
const ListBlockSchema: z.ZodType<RichListBlock> = z.lazy(() => z.discriminatedUnion('type', [ParagraphSchema, ...ListSchemas]));
const CellSchema = z.object({ type: z.enum(['tableHeader', 'tableCell']), content: z.array(ParagraphSchema).min(1).max(50) });
const BlockSchema: z.ZodType<RichBlock> = z.lazy(() =>
  z.discriminatedUnion('type', [
    ParagraphSchema,
    ...ListSchemas,
    z.object({ type: z.literal('heading'), attrs: z.object({ level: z.union([z.literal(4), z.literal(5)]) }), content: z.array(InlineSchema).max(500).optional() }),
    z.object({ type: z.literal('table'), content: z.array(z.object({ type: z.literal('tableRow'), content: z.array(CellSchema).min(1).max(20) })).min(1).max(100) }),
  ]),
);

/** How deeply objects and arrays nest (checked before parsing, so a hostile document cannot exhaust the parser). */
function depth(value: unknown, level = 0): number {
  if (level > MAX_DEPTH || value === null || typeof value !== 'object') return level;
  let deepest = level;
  for (const child of Object.values(value)) deepest = Math.max(deepest, depth(child, level + 1));
  return deepest;
}

export const RichDocSchema: z.ZodType<RichDoc> = z
  .unknown()
  .refine((value) => depth(value) <= MAX_DEPTH, 'The text is nested too deeply')
  .pipe(z.object({ type: z.literal('doc'), content: z.array(BlockSchema).max(1000) }))
  .refine((value) => plainText(value).length <= MAX_TEXT, `Keep the text under ${MAX_TEXT} characters`) as unknown as z.ZodType<RichDoc>;

const inlineText = (content: RichInline[] = []) => content.map((inline) => (inline.type === 'text' ? inline.text : '\n')).join('');

function blockText(block: RichBlock): string[] {
  if (block.type === 'paragraph' || block.type === 'heading') return [inlineText(block.content)];
  if (block.type === 'table') return block.content.flatMap((row) => row.content.flatMap((cell) => cell.content.map((paragraph) => inlineText(paragraph.content))));
  return block.content.flatMap((item) => item.content.flatMap(blockText));
}

/** The words of a document, one line per paragraph, heading, list item or table cell paragraph (empty ones dropped). */
export function plainText(doc: RichDoc): string {
  return doc.content
    .flatMap(blockText)
    .filter((line) => line.trim() !== '')
    .join('\n');
}
