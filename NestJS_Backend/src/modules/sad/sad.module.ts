import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { SadPdfService } from './sad-pdf.service.js';
import { SadDiagramDefaultsService } from './sad-diagram-defaults.service.js';
import { SadRetentionService } from './sad-retention.service.js';
import { SadUploadFiles } from './sad-upload-files.js';
import { SadUploadsController } from './sad-uploads.controller.js';
import { SadUploadsService } from './sad-uploads.service.js';
import { SadController, SadDiagramDefaultsController, SadRetentionController } from './sad.controllers.js';
import { SadService } from './sad.service.js';

/** Solution Architecture Documents: template, drafts, versions, approval, API inventory, retention list, PDF, diagrams and their files. */
@Module({
  imports: [ApprovalsModule],
  controllers: [SadController, SadRetentionController, SadDiagramDefaultsController, SadUploadsController],
  providers: [SadService, SadRetentionService, SadPdfService, SadDiagramDefaultsService, SadUploadFiles, SadUploadsService],
})
export class SadModule {}
