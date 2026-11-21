/** PMO's rules for files under a diagram (docs/modules/sad.md, Uploads). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOADS_PER_DIAGRAM = 20;

const CONTENT_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  vsdx: 'application/vnd.ms-visio.drawing',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  drawio: 'application/vnd.jgraph.mxfile',
} as const;
export type UploadType = keyof typeof CONTENT_TYPES;
export const UPLOAD_TYPES = Object.keys(CONTENT_TYPES) as UploadType[];
/** The content type a stored file is sent with. */
export const contentTypeOf = (type: UploadType): string => CONTENT_TYPES[type];

/** The part that makes an Office Open XML package (a ZIP) a document of its kind. */
const OOXML_PART: Partial<Record<UploadType, string>> = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml', vsdx: 'visio/document.xml' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Whether the content is what the extension says (a ZIP's entry names are stored as plain text, so they can be found). */
function looksLike(type: UploadType, bytes: Buffer): boolean {
  const part = OOXML_PART[type];
  if (part) return bytes.subarray(0, 4).toString('latin1') === 'PK\x03\x04' && bytes.includes('[Content_Types].xml') && bytes.includes(part);
  if (type === 'pdf') return bytes.subarray(0, 5).toString('latin1') === '%PDF-';
  if (type === 'png') return bytes.subarray(0, 8).equals(PNG);
  if (type === 'drawio') return /^(<\?xml[^>]*\?>\s*)?<(mxfile|mxGraphModel)[\s>]/.test(bytes.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '').trimStart());
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export type UploadCheck = { ok: true; type: UploadType; contentType: string } | { ok: false; message: string };

/** Accepts the agreed formats only, by extension and by content; refuses Office files carrying macros. */
export function checkUpload(name: string, bytes: Buffer): UploadCheck {
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, message: 'Files must be 25 MB or smaller.' };
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (!name.includes('.') || !(extension in CONTENT_TYPES)) return { ok: false, message: 'Choose a Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io file.' };
  const type = extension as UploadType;
  if (!looksLike(type, bytes)) return { ok: false, message: `This file is not really a ${type.toUpperCase()} file.` };
  // VBA projects (and their signatures) and Excel 4.0 macro sheets, found by their part names.
  if (OOXML_PART[type] && (bytes.includes('vbaProject') || bytes.includes('macrosheets/'))) return { ok: false, message: 'Files with macros are not accepted.' };
  return { ok: true, type, contentType: CONTENT_TYPES[type] };
}

/** The name a file is kept under: no folders or control characters, at most 200 characters, keeping its extension. */
export function safeName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const dot = base.lastIndexOf('.');
  const extension = dot >= 0 ? base.slice(dot) : '';
  const stem = (dot >= 0 ? base.slice(0, dot) : base).trim() || 'file';
  return stem.slice(0, 200 - extension.length) + extension;
}
