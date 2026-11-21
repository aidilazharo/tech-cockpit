import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { buildSadPdf, type PdfVersion } from './sad-pdf.js';
import { renderPdf } from './sad-pdf-render.js';
import { SadUploadsService } from './sad-uploads.service.js';
import { SadService } from './sad.service.js';

@Injectable()
export class SadPdfService {
  constructor(
    private readonly sad: SadService,
    private readonly uploads: SadUploadsService,
    private readonly audit: AuditService,
  ) {}

  /** What the PDF holds for the caller: the version, its diagrams and their files, each only as far as they may see it. */
  async document(principal: Principal, versionId: string): Promise<{ definition: TDocumentDefinitions; filename: string }> {
    const { view, history } = await this.sad.exportData(principal, versionId);
    const { items: slots, apis } = await this.sad.diagrams(principal, versionId);
    const { items: uploads } = await this.uploads.list(principal, versionId);
    // The rows the backup schedule ticks, as the version keeps them.
    const definition = buildSadPdf(view as unknown as PdfVersion, history, view.retention, new Date(), { slots, apis, uploads });
    const name = (view.application.name ?? view.application.number ?? 'application').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    return { definition, filename: `SAD-${name}-${view.number ? `v${view.number}` : 'draft'}.pdf` };
  }

  /** The version as a PDF in the AIA template layout, with only what the caller may see. Audited. */
  async render(principal: Principal, versionId: string): Promise<{ file: Buffer; filename: string }> {
    const { definition, filename } = await this.document(principal, versionId);
    const file = await renderPdf(definition);
    await this.audit.recordChange(principal, 'sad.version.exported', 'sad-version', versionId, { before: null, after: { format: 'pdf' } });
    return { file, filename };
  }
}
