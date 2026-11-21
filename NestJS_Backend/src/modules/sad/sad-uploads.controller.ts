import { Controller, Delete, Get, Header, HttpCode, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiNoContentResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodParam, ZodResponse } from '../../common/zod/index.js';
import { AuditResource, Authenticated, CurrentPrincipal, RequireAnyPermission } from '../access/decorators.js';
import type { PermissionCode } from '../access/permission-catalogue.js';
import type { Principal } from '../access/principal.js';
import type { DiagramSlot } from './domain/diagrams.js';
import { SAD_SECTION_KEYS, sadUpdate } from './domain/sections.js';
import { MAX_UPLOAD_BYTES } from './domain/uploads.js';
import { SadUploadsService, type ChosenFile } from './sad-uploads.service.js';
import { SadDiagramIdSchema, SadDiagramSlotSchema, SadUploadSchema, SadUploadsSchema } from './sad.schemas.js';

const IdParam = z.uuid();
const EDIT_ANY_SECTION = SAD_SECTION_KEYS.map(sadUpdate) as [PermissionCode, ...PermissionCode[]];
const READERS = 'Readers of a section that shows the diagram (or approvers of the version); the service checks which diagrams they see';

/** A name for the Content-Disposition header: plain ASCII as filename, the exact name (UTF-8) as filename*. */
function disposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const exact = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${exact}`;
}

/** Files under each diagram of a SAD version (docs/modules/sad.md, Uploads). */
@ApiTags('SAD')
@AuditResource('sad')
@Controller({ path: 'sad/versions/:id', version: '1' })
export class SadUploadsController {
  constructor(private readonly uploads: SadUploadsService) {}

  @Get('uploads')
  @Authenticated(READERS)
  @ZodResponse({ status: 200, schema: SadUploadsSchema, description: 'The files under the diagrams you see, in the order they were uploaded' })
  list(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.uploads.list(principal, id);
  }

  @Post('diagrams/:slot/:diagramId/uploads')
  @RequireAnyPermission(...EDIT_ANY_SECTION)
  // File names are UTF-8 (multer reads them as Latin-1 unless told).
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }, defParamCharset: 'utf8' }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ZodResponse({
    status: 201,
    schema: SadUploadSchema,
    description:
      "File added under a saved diagram of a draft, by the editors who draw it: Word, Excel, PowerPoint, PDF, PNG, JPG, Visio or draw.io (checked by content), up to 25 MB, up to 20 a diagram",
  })
  add(
    @CurrentPrincipal() principal: Principal,
    @ZodParam('id', IdParam) id: string,
    @ZodParam('slot', SadDiagramSlotSchema) slot: DiagramSlot,
    @ZodParam('diagramId', SadDiagramIdSchema) diagramId: string,
    @UploadedFile() file: ChosenFile | undefined,
  ) {
    return this.uploads.add(principal, id, slot, diagramId, file);
  }

  @Delete('uploads/:uploadId')
  @RequireAnyPermission(...EDIT_ANY_SECTION)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'File removed from the draft (its stored copy goes when no version uses it)' })
  async remove(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodParam('uploadId', IdParam) uploadId: string): Promise<void> {
    await this.uploads.remove(principal, id, uploadId);
  }

  @Get('uploads/:uploadId/file')
  @Authenticated(READERS)
  @Header('cache-control', 'no-store')
  @Header('x-content-type-options', 'nosniff')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'The file, as an attachment; refused with 409 while it is checked for malware, or when it was blocked', schema: { type: 'string', format: 'binary' } })
  async download(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodParam('uploadId', IdParam) uploadId: string, @Res({ passthrough: true }) res: Response) {
    const { stream, name, contentType } = await this.uploads.download(principal, id, uploadId);
    res.setHeader('content-type', contentType);
    res.setHeader('content-disposition', disposition(name));
    return new StreamableFile(stream);
  }
}
