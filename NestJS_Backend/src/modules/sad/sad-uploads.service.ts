import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RequestValidationException } from '../../common/zod/index.js';
import { AccessService } from '../access/access.service.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { personName } from '../identity/person-name.js';
import { User } from '../identity/user.entity.js';
import { NotificationService } from '../notifications/notification.service.js';
import { FILE_STORAGE, StoredFileMissing, type FileStorage } from '../storage/file-storage.js';
import type { DiagramSlot } from './domain/diagrams.js';
import { checkUpload, contentTypeOf, MAX_UPLOADS_PER_DIAGRAM, safeName } from './domain/uploads.js';
import { SadUploadFiles } from './sad-upload-files.js';
import { SadDiagram, SadFile, SadUpload, SadVersion } from './sad.entities.js';
import { SadService } from './sad.service.js';

/** A file as chosen in the browser (multer's in-memory file). */
export interface ChosenFile {
  originalname: string;
  buffer: Buffer;
}

/** Why a file cannot be downloaded yet, or at all. */
const HELD: Partial<Record<SadFile['scan'], string>> = {
  scanning: 'This file is still being checked for malware.',
  failed: 'This file could not be checked for malware.',
  malicious: 'This file was blocked: malware was found in it.',
};

/** Files under each diagram of a SAD version (docs/modules/sad.md, Uploads). */
@Injectable()
export class SadUploadsService {
  private readonly logger = new Logger(SadUploadsService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly sad: SadService,
    private readonly files: SadUploadFiles,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly notifications: NotificationService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  private view(upload: SadUpload, names: boolean) {
    const { file } = upload;
    return {
      id: upload.id,
      slot: upload.slot,
      diagramId: upload.diagramId,
      name: file.name,
      type: file.type,
      size: file.size,
      scan: file.scan,
      uploadedBy: names ? { id: file.uploadedBy.id, name: personName(file.uploadedBy) } : null,
      uploadedAt: file.createdAt.toISOString(),
    };
  }

  /** The files under the diagrams the caller sees, in the order they were uploaded. */
  async list(principal: Principal, versionId: string) {
    const { slots, names } = await this.sad.slotAccess(principal, versionId);
    const readable = [...slots].filter(([, slot]) => slot.readable).map(([key]) => key);
    const uploads = await this.em.fork().find(SadUpload, { sadVersion: versionId, slot: { $in: readable } }, { populate: ['file.uploadedBy'], orderBy: { file: { createdAt: 'asc', name: 'asc' }, id: 'asc' } });
    return { items: uploads.map((upload) => this.view(upload, names)) };
  }

  /** Adds a file under a diagram of a draft: the editors who draw the diagram only, PMO's formats only, up to 20 a diagram. */
  async add(principal: Principal, versionId: string, slot: DiagramSlot, diagramId: string, chosen: ChosenFile | undefined) {
    const { slots, names } = await this.sad.slotAccess(principal, versionId);
    const access = slots.get(slot)!;
    if (!access.drawable) throw new ForbiddenException('You cannot add files to this diagram.');
    if (!chosen) throw new RequestValidationException([{ path: 'file', message: 'Choose a file.' }]);
    const check = checkUpload(chosen.originalname, chosen.buffer);
    if (!check.ok) throw new RequestValidationException([{ path: 'file', message: check.message }]);

    const key = `sad/${randomUUID()}`;
    await this.storage.put(key, chosen.buffer, check.contentType);
    const name = safeName(chosen.originalname);
    let upload: SadUpload;
    try {
      // Checked under the version's lock, so a draft submitted meanwhile takes no file.
      upload = await this.em.fork().transactional(async (tx) => {
        const locked = await tx.findOneOrFail(SadVersion, versionId, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (locked.status !== 'draft') throw new ConflictException('Only a draft can be edited.');
        // The diagram as saved, read under the same lock as a save of its slot.
        const saved = (await tx.findOne(SadDiagram, { sadVersion: versionId, slot }))?.content;
        if (!saved || 'notApplicable' in saved || !saved.diagrams.some((diagram) => diagram.id === diagramId)) throw new ConflictException('Save the diagram first, then add files to it.');
        if ((await tx.count(SadUpload, { sadVersion: versionId, slot, diagramId })) >= MAX_UPLOADS_PER_DIAGRAM) throw new ConflictException(`A diagram holds up to ${MAX_UPLOADS_PER_DIAGRAM} files.`);
        const file = tx.create(SadFile, {
          storageKey: key,
          name,
          type: check.type,
          size: chosen.buffer.length,
          sha256: createHash('sha256').update(chosen.buffer).digest('hex'),
          scan: this.storage.scanned ? 'scanning' : 'unscanned',
          uploadedBy: tx.getReference(User, principal.user.id),
          createdBy: principal.user.id,
          updatedBy: principal.user.id,
        });
        return tx.create(SadUpload, { sadVersion: locked, slot, diagramId, file, createdBy: principal.user.id, updatedBy: principal.user.id });
      });
    } catch (error) {
      await this.storage.remove(key);
      throw error;
    }
    await this.audit.recordChange(principal, 'sad.upload.added', 'sad-version', versionId, { before: null, after: { slot, diagramId, name, size: chosen.buffer.length } }, { slot });
    await this.em.fork().populate(upload, ['file.uploadedBy']);
    return this.view(upload, names);
  }

  /** Removes a file from a draft at once; its stored copy goes when no version uses it. */
  async remove(principal: Principal, versionId: string, uploadId: string): Promise<void> {
    const { slots } = await this.sad.slotAccess(principal, versionId);
    const em = this.em.fork();
    const upload = await em.findOne(SadUpload, { id: uploadId, sadVersion: versionId }, { populate: ['file'] });
    if (!upload || !slots.get(upload.slot)!.readable) throw new NotFoundException('File not found');
    if (!slots.get(upload.slot)!.drawable) throw new ForbiddenException('You cannot remove files from this diagram.');
    const { slot, diagramId, file } = upload;
    await em.transactional(async (tx) => {
      const locked = await tx.findOneOrFail(SadVersion, versionId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (locked.status !== 'draft') throw new ConflictException('Only a draft can be edited.');
      tx.remove(tx.getReference(SadUpload, upload.id));
    });
    await this.files.purge([file]);
    await this.audit.recordChange(principal, 'sad.upload.removed', 'sad-version', versionId, { before: { slot, diagramId, name: file.name }, after: null }, { slot });
  }

  /** Deletes stored files no version uses, e.g. those storage refused to delete when they were freed. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'sad-upload-purge' })
  async purgeUnused(): Promise<void> {
    await this.files.purge(await this.files.unused());
  }

  /** A file to download: for those who see its diagram, once Defender reports it clean (or locally, at once). */
  async download(principal: Principal, versionId: string, uploadId: string): Promise<{ stream: Readable; name: string; contentType: string }> {
    const { slots } = await this.sad.slotAccess(principal, versionId);
    const upload = await this.em.fork().findOne(SadUpload, { id: uploadId, sadVersion: versionId }, { populate: ['file'] });
    if (!upload || !slots.get(upload.slot)!.readable) throw new NotFoundException('File not found');
    const held = HELD[upload.file.scan];
    if (held) throw new ConflictException(held);
    try {
      return { stream: await this.storage.read(upload.file.storageKey), name: upload.file.name, contentType: contentTypeOf(upload.file.type) };
    } catch (error) {
      if (error instanceof StoredFileMissing) throw new NotFoundException('File not found');
      throw error;
    }
  }

  /**
   * Deployed only: takes Defender for Storage's verdict on files still being scanned. A malicious file is blocked, its
   * stored copy deleted, and its uploader and every system administrator told.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'sad-upload-scans' })
  async checkScans(): Promise<void> {
    if (!this.storage.scanned) return;
    const em = this.em.fork();
    const malicious: SadFile[] = [];
    // Each file on its own: one that cannot be checked now never holds up the others.
    for (const file of await em.find(SadFile, { scan: 'scanning' })) {
      try {
        const result = await this.storage.scanResult(file.storageKey);
        if (result === 'scanning') continue;
        file.scan = result;
        if (result === 'malicious') malicious.push(file);
      } catch (error) {
        if (!(error instanceof StoredFileMissing)) {
          this.logger.warn(`Could not check stored file ${file.id} for malware; will try again: ${(error as Error).message}`);
          continue;
        }
        // Its stored copy is gone (e.g. deleted by Defender): it can never be checked or downloaded.
        file.scan = 'failed';
        file.removedAt = new Date();
      }
      await em.flush();
    }
    // Blocked files' stored copies are deleted; one storage refused to delete before is tried again.
    for (const file of await em.find(SadFile, { scan: 'malicious', removedAt: null })) {
      try {
        await this.storage.remove(file.storageKey);
        file.removedAt = new Date();
        await em.flush();
      } catch (error) {
        this.logger.warn(`Could not delete blocked stored file ${file.id}; will try again: ${(error as Error).message}`);
      }
    }
    if (malicious.length === 0) return;
    this.logger.warn(`Blocked ${malicious.length} malicious upload(s)`);
    const admins = await this.access.systemAdmins(new Date());
    for (const file of malicious) {
      const latest = await em.findOneOrFail(SadUpload, { file }, { populate: ['sadVersion.document.application'], orderBy: { createdAt: 'desc' } });
      const recipients = new Set([file.uploadedBy.id, ...admins.map((admin) => admin.id)]);
      await this.notifications.send(
        [...recipients].map((recipientId) => ({
          recipientId,
          type: 'sad.upload.malicious' as const,
          // A populated application's name is text or null (ServiceNow may not hold one).
          params: { file: file.name, application: latest.sadVersion.document.application.name as string | null },
          link: `/sad/versions/${latest.sadVersion.id}`,
        })),
      );
    }
  }
}
