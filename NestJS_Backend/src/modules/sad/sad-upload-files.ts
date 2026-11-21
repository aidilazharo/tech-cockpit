import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FILE_STORAGE, type FileStorage } from '../storage/file-storage.js';
import type { DiagramSlot } from './domain/diagrams.js';
import { SadFile, SadUpload, type SadVersion } from './sad.entities.js';

/**
 * The bookkeeping of files under diagrams that SAD versions share: a new draft refers to its source's stored files, a
 * slot saved without a diagram loses that diagram's files, and a stored file goes once no version uses it.
 */
@Injectable()
export class SadUploadFiles {
  private readonly logger = new Logger(SadUploadFiles.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** A new draft starts with its source version's files (the same stored files). */
  async carry(tx: EntityManager, from: SadVersion, to: SadVersion, userId: string): Promise<void> {
    for (const upload of await tx.find(SadUpload, { sadVersion: from })) {
      tx.create(SadUpload, { sadVersion: to, slot: upload.slot, diagramId: upload.diagramId, file: upload.file, createdBy: userId, updatedBy: userId });
    }
  }

  /** Removes a slot's files under diagrams no longer in it; returns their stored files, to purge after the commit. */
  async prune(tx: EntityManager, versionId: string, slot: DiagramSlot, diagramIds: readonly string[]): Promise<SadFile[]> {
    const gone = await tx.find(SadUpload, { sadVersion: versionId, slot, diagramId: { $nin: [...diagramIds] } });
    tx.remove(gone);
    return gone.map((upload) => upload.file);
  }

  /** Removes every file of a version (a cancelled draft); returns their stored files, to purge after the commit. */
  async dropAll(tx: EntityManager, versionId: string): Promise<SadFile[]> {
    const uploads = await tx.find(SadUpload, { sadVersion: versionId });
    tx.remove(uploads);
    return uploads.map((upload) => upload.file);
  }

  /**
   * Deletes stored files no version uses any more (a blocked file's copy is already gone). One storage refuses to
   * delete stays recorded, for `SadUploadsService.purgeUnused` to try again: the change that freed it stands.
   */
  async purge(files: readonly SadFile[]): Promise<void> {
    const em = this.em.fork();
    for (const file of await em.find(SadFile, { id: { $in: [...new Set(files.map((item) => item.id))] } })) {
      if ((await em.count(SadUpload, { file })) > 0) continue;
      try {
        if (!file.removedAt) await this.storage.remove(file.storageKey);
      } catch (error) {
        this.logger.warn(`Could not delete stored file ${file.id}; will try again: ${(error as Error).message}`);
        continue;
      }
      em.remove(file);
    }
    await em.flush();
  }

  /** Every stored file no version uses (e.g. one storage refused to delete before). */
  async unused(): Promise<SadFile[]> {
    const em = this.em.fork();
    const used = new Set((await em.find(SadUpload, {}, { fields: ['file'] })).map((upload) => upload.file.id));
    return (await em.find(SadFile, {})).filter((file) => !used.has(file.id));
  }
}
