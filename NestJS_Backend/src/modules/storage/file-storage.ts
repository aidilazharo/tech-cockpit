import { createReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { ManagedIdentityCredential } from '@azure/identity';
import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { Env } from '../../config/env.js';

/**
 * Defender for Storage's verdict on a stored file: still being scanned, clean, malicious, or could not be scanned
 * (held, like a file being scanned). Files kept in the local folder are never scanned.
 */
export type ScanResult = 'scanning' | 'clean' | 'malicious' | 'failed' | 'unscanned';

/** Where uploaded files are kept, by key (e.g. "sad/<uuid>"). */
export interface FileStorage {
  /** Whether stored files are scanned for malware (Defender for Storage) */
  readonly scanned: boolean;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** The file's content; StoredFileMissing when there is none */
  read(key: string): Promise<Readable>;
  /** Removes the file (nothing happens when it is not there) */
  remove(key: string): Promise<void>;
  scanResult(key: string): Promise<ScanResult>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export class StoredFileMissing extends Error {
  constructor(key: string) {
    super(`No stored file ${key}`);
    this.name = 'StoredFileMissing';
  }
}

/** Keys are lowercase words and numbers in folders: nothing that could reach outside the storage. */
function checkKey(key: string): string {
  if (!/^[a-z0-9-]{1,100}(\/[a-z0-9-]{1,100})*$/.test(key)) throw new Error('Not a storage key');
  return key;
}

/** Development: a local folder. */
export class LocalFileStorage implements FileStorage {
  readonly scanned = false;
  constructor(private readonly root: string) {}

  private path(key: string): string {
    return resolve(this.root, ...checkKey(key).split('/'));
  }

  // The local folder keeps no content type: downloads take it from the file's record.
  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async read(key: string): Promise<Readable> {
    const path = this.path(key);
    await access(path).catch(() => {
      throw new StoredFileMissing(key);
    });
    return createReadStream(path);
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async scanResult(key: string): Promise<ScanResult> {
    checkKey(key);
    return 'unscanned';
  }
}

/** Defender for Storage writes its verdict in this index tag of each blob it scans. */
const SCAN_TAG = 'Malware Scanning scan result';

/** Deployed: an Azure Blob Storage container, scanned by Defender for Storage. */
export class AzureBlobStorage implements FileStorage {
  readonly scanned = true;
  constructor(readonly container: ContainerClient) {}

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.container.getBlockBlobClient(checkKey(key)).uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
  }

  async read(key: string): Promise<Readable> {
    try {
      return (await this.container.getBlobClient(checkKey(key)).download()).readableStreamBody as Readable;
    } catch (error) {
      if (error instanceof RestError && error.statusCode === 404) throw new StoredFileMissing(key);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await this.container.getBlobClient(checkKey(key)).deleteIfExists();
  }

  async scanResult(key: string): Promise<ScanResult> {
    const { tags } = await this.container
      .getBlobClient(checkKey(key))
      .getTags()
      .catch((error: unknown) => {
        if (error instanceof RestError && error.statusCode === 404) throw new StoredFileMissing(key);
        throw error;
      });
    const verdict = tags[SCAN_TAG];
    if (verdict === undefined) return 'scanning';
    return verdict === 'No threats found' ? 'clean' : verdict === 'Malicious' ? 'malicious' : 'failed';
  }
}

/** The local folder in development; Azure Blob Storage, reached with the App Service's managed identity, when deployed. */
export function createFileStorage(env: Env): FileStorage {
  if (env.STORAGE_DRIVER === 'local') return new LocalFileStorage(resolve(env.STORAGE_LOCAL_PATH));
  const credential = env.STORAGE_AZURE_CLIENT_ID ? new ManagedIdentityCredential({ clientId: env.STORAGE_AZURE_CLIENT_ID }) : new ManagedIdentityCredential();
  return new AzureBlobStorage(new BlobServiceClient(env.STORAGE_AZURE_ACCOUNT_URL!, credential).getContainerClient(env.STORAGE_AZURE_CONTAINER));
}
