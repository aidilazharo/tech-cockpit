import { Readable } from 'node:stream';
import { StoredFileMissing, type FileStorage, type ScanResult } from '../../../src/modules/storage/file-storage.js';

/** Uploads kept in memory, with Defender's verdicts set by the test (scanned like Azure, or not like the local folder). */
export class MemoryStorage implements FileStorage {
  scanned = false;
  readonly files = new Map<string, { data: Buffer; contentType: string }>();
  readonly verdicts = new Map<string, ScanResult>();
  /** Keys whose reads, scan checks or removals fail as an unreachable storage would */
  readonly failing = new Set<string>();
  readonly failingScans = new Set<string>();
  readonly failingRemoves = new Set<string>();

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    this.files.set(key, { data, contentType });
  }

  async read(key: string): Promise<Readable> {
    if (this.failing.has(key)) throw new Error('Storage unavailable');
    const file = this.files.get(key);
    if (!file) throw new StoredFileMissing(key);
    return Readable.from(file.data);
  }

  async remove(key: string): Promise<void> {
    if (this.failingRemoves.has(key)) throw new Error('Storage unavailable');
    this.files.delete(key);
  }

  async scanResult(key: string): Promise<ScanResult> {
    if (!this.scanned) return 'unscanned';
    if (this.failingScans.has(key)) throw new Error('Storage unavailable');
    if (!this.files.has(key)) throw new StoredFileMissing(key);
    return this.verdicts.get(key) ?? 'scanning';
  }
}
