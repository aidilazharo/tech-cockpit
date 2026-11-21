import { describe, expect, it } from 'vitest';
import { checkUpload, MAX_UPLOAD_BYTES, safeName } from './uploads.js';

/** A minimal Office Open XML package: a ZIP whose entries name the parts that make it a document of its kind. */
const ooxml = (...entries: string[]) => Buffer.concat([Buffer.from('PK\x03\x04'), ...['[Content_Types].xml', ...entries].map((name) => Buffer.from(`\x14\x00${name}\x00`))]);
const PDF = Buffer.from('%PDF-1.7\n...');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const DRAWIO = Buffer.from('<?xml version="1.0"?>\n<mxfile host="app.diagrams.net"><diagram/></mxfile>');

describe('which files can be uploaded', () => {
  it.each<[string, Buffer, string]>([
    ['design.docx', ooxml('word/document.xml'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['sizing.xlsx', ooxml('xl/workbook.xml'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['overview.pptx', ooxml('ppt/presentation.xml'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['network.vsdx', ooxml('visio/document.xml'), 'application/vnd.ms-visio.drawing'],
    ['report.PDF', PDF, 'application/pdf'],
    ['screen.png', PNG, 'image/png'],
    ['photo.jpg', JPG, 'image/jpeg'],
    ['photo.jpeg', JPG, 'image/jpeg'],
    ['crm.drawio', DRAWIO, 'application/vnd.jgraph.mxfile'],
    ['bare.drawio', Buffer.from('<mxGraphModel><root/></mxGraphModel>'), 'application/vnd.jgraph.mxfile'],
  ])('accepts %s', (name, bytes, contentType) => {
    expect(checkUpload(name, bytes)).toEqual({ ok: true, type: name.split('.').pop()!.toLowerCase(), contentType });
  });

  it.each<[string, string, Buffer, string]>([
    ['another format', 'tool.exe', Buffer.from('MZ'), 'Choose a Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io file.'],
    ['an SVG', 'logo.svg', Buffer.from('<svg/>'), 'Choose a Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io file.'],
    ['a ZIP', 'bundle.zip', ooxml(), 'Choose a Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io file.'],
    ['an old Office format', 'old.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), 'Choose a Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io file.'],
    ['a program renamed as a PDF', 'invoice.pdf', Buffer.from('MZ\x90\x00'), 'This file is not really a PDF file.'],
    ['a spreadsheet renamed as a Word document', 'design.docx', ooxml('xl/workbook.xml'), 'This file is not really a DOCX file.'],
    ['a ZIP renamed as a Word document', 'design.docx', ooxml(), 'This file is not really a DOCX file.'],
    ['an SVG renamed as a draw.io file', 'crm.drawio', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'This file is not really a DRAWIO file.'],
    ['a document with macros', 'design.docx', ooxml('word/document.xml', 'word/vbaProject.bin'), 'Files with macros are not accepted.'],
    ['a macro project signature', 'design.docx', ooxml('word/document.xml', 'word/vbaProjectSignature.bin'), 'Files with macros are not accepted.'],
    ['a spreadsheet with Excel 4.0 macro sheets', 'sizing.xlsx', ooxml('xl/workbook.xml', 'xl/macrosheets/sheet1.xml'), 'Files with macros are not accepted.'],
    ['an empty file', 'empty.pdf', Buffer.alloc(0), 'This file is not really a PDF file.'],
  ])('refuses %s', (_, name, bytes, message) => {
    expect(checkUpload(name, bytes)).toEqual({ ok: false, message });
  });

  it('refuses files over 25 MB', () => {
    expect(checkUpload('big.pdf', Buffer.concat([PDF, Buffer.alloc(MAX_UPLOAD_BYTES)]))).toEqual({ ok: false, message: 'Files must be 25 MB or smaller.' });
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe('the name a file is kept under', () => {
  it('drops folders and control characters, and keeps at most 200 characters with its extension', () => {
    expect(safeName('C:\\Users\\ada\\Design v2.docx')).toBe('Design v2.docx');
    expect(safeName('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(safeName('bad\u0000name\u001f.png')).toBe('badname.png');
    expect(safeName(`${'a'.repeat(300)}.pdf`)).toBe(`${'a'.repeat(196)}.pdf`);
    expect(safeName('   .pdf')).toBe('file.pdf');
    expect(safeName('README')).toBe('README');
  });
});
