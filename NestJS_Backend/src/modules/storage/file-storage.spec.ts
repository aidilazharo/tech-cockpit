import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { RestError, type BlockBlobParallelUploadOptions, type ContainerClient } from '@azure/storage-blob';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { AzureBlobStorage, createFileStorage, LocalFileStorage, StoredFileMissing } from './file-storage.js';

/**
 * A stand-in for an Azure Blob Storage container: the calls AzureBlobStorage makes, answering as the SDK does (a missing
 * blob is a RestError with status 404). `failure`, when set, is what every call throws instead.
 */
function fakeContainer() {
  const blobs = new Map<string, { data: Buffer; contentType?: string; tags: Record<string, string> }>();
  const state = { failure: null as Error | null };
  const find = (key: string) => {
    if (state.failure) throw state.failure;
    const blob = blobs.get(key);
    if (!blob) throw new RestError('The specified blob does not exist.', { code: 'BlobNotFound', statusCode: 404 });
    return blob;
  };
  const container = {
    getBlockBlobClient: (key: string) => ({
      uploadData: async (data: Buffer, options?: BlockBlobParallelUploadOptions) => {
        if (state.failure) throw state.failure;
        blobs.set(key, { data, contentType: options?.blobHTTPHeaders?.blobContentType, tags: {} });
      },
    }),
    getBlobClient: (key: string) => ({
      download: async () => ({ readableStreamBody: Readable.from([find(key).data]) }),
      deleteIfExists: async () => ({ succeeded: blobs.delete(key) }),
      getTags: async () => ({ tags: { ...find(key).tags } }),
    }),
  };
  return { storage: new AzureBlobStorage(container as unknown as ContainerClient), blobs, state };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tc-storage-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the local folder (development)', () => {
  it('keeps, reads back and removes files under their keys; nothing is scanned for malware', async () => {
    const storage = new LocalFileStorage(root);
    expect(storage.scanned).toBe(false);
    await storage.put('sad/0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f', Buffer.from('%PDF-1.7'), 'application/pdf');
    expect(await text(await storage.read('sad/0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f'))).toBe('%PDF-1.7');
    expect(await storage.scanResult('sad/0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f')).toBe('unscanned');
    await storage.remove('sad/0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f');
    await storage.remove('sad/0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f');
    expect(await readdir(join(root, 'sad'))).toEqual([]);
    await expect(storage.read('sad/0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f')).rejects.toBeInstanceOf(StoredFileMissing);
  });

  it.each(['../outside', 'sad/../../etc/passwd', '/etc/passwd', 'sad\\x', ''])('refuses the key %j, which could reach outside its folder', async (key) => {
    await expect(new LocalFileStorage(root).put(key, Buffer.from('x'), 'text/plain')).rejects.toThrow('Not a storage key');
  });
});

describe('Azure Blob Storage (deployed)', () => {
  const KEY_1 = 'sad/0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f';

  it('keeps a file with its content type, reads it back and removes it', async () => {
    const { storage, blobs } = fakeContainer();
    expect(storage.scanned).toBe(true);
    await storage.put(KEY_1, Buffer.from('%PDF-1.7'), 'application/pdf');
    expect(blobs.get(KEY_1)?.contentType).toBe('application/pdf');
    expect(await text(await storage.read(KEY_1))).toBe('%PDF-1.7');
    await storage.remove(KEY_1);
    await storage.remove(KEY_1);
    expect(blobs.size).toBe(0);
    await expect(storage.read(KEY_1)).rejects.toBeInstanceOf(StoredFileMissing);
  });

  it("reads Defender for Storage's verdict from the blob's index tags", async () => {
    const { storage, blobs } = fakeContainer();
    const tag = (result: string) => (blobs.get(KEY_1)!.tags['Malware Scanning scan result'] = result);
    await storage.put(KEY_1, Buffer.from('%PDF-1.7'), 'application/pdf');
    expect(await storage.scanResult(KEY_1)).toBe('scanning');
    tag('No threats found');
    expect(await storage.scanResult(KEY_1)).toBe('clean');
    tag('Malicious');
    expect(await storage.scanResult(KEY_1)).toBe('malicious');
    // Defender could not scan it (e.g. an error): it stays held.
    tag('Error');
    expect(await storage.scanResult(KEY_1)).toBe('failed');
    // A blob gone from the container (e.g. deleted by Defender) is a missing file, as for reading it.
    await storage.remove(KEY_1);
    await expect(storage.scanResult(KEY_1)).rejects.toBeInstanceOf(StoredFileMissing);
  });

  it.each([
    ['a refused request', new RestError('Server failed to authenticate the request.', { code: 'AuthenticationFailed', statusCode: 403 })],
    ['a network failure', new Error('getaddrinfo ENOTFOUND tcuploads.blob.core.windows.net')],
  ])('passes on %s, which is not a missing file', async (_, failure) => {
    const { storage, state } = fakeContainer();
    await storage.put(KEY_1, Buffer.from('%PDF-1.7'), 'application/pdf');
    state.failure = failure;
    await expect(storage.read(KEY_1)).rejects.toBe(failure);
    await expect(storage.scanResult(KEY_1)).rejects.toBe(failure);
  });

  it.each(['../outside', 'sad/../../etc/passwd', 'Sad/X', ''])('refuses the key %j, which could reach outside its container', async (key) => {
    const { storage, blobs } = fakeContainer();
    await expect(storage.put(key, Buffer.from('x'), 'text/plain')).rejects.toThrow('Not a storage key');
    await expect(storage.read(key)).rejects.toThrow('Not a storage key');
    await expect(storage.scanResult(key)).rejects.toThrow('Not a storage key');
    expect(blobs.size).toBe(0);
  });
});

describe('choosing the storage', () => {
  const env = { DB_HOST: 'h', DB_NAME: 'n', DB_SCHEMA: 'tc_x', DB_APP_USER: 'a', DB_APP_PASSWORD: 'p', DB_MIGRATION_USER: 'm', DB_MIGRATION_PASSWORD: 'p', SESSION_JWT_SECRET: 's'.repeat(32) };
  it('is the local folder in development, and Azure Blob Storage with the managed identity when deployed', () => {
    expect(createFileStorage(parseEnv({ ...env, STORAGE_LOCAL_PATH: root }))).toBeInstanceOf(LocalFileStorage);
    const azure = createFileStorage(parseEnv({ ...env, STORAGE_DRIVER: 'azure-blob', STORAGE_AZURE_ACCOUNT_URL: 'https://tcuploads.blob.core.windows.net', STORAGE_AZURE_CLIENT_ID: '0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f' }));
    expect(azure).toBeInstanceOf(AzureBlobStorage);
    expect(azure.scanned).toBe(true);
    expect((azure as AzureBlobStorage).container.url).toBe('https://tcuploads.blob.core.windows.net/sad-uploads');
    // The system-assigned identity when no user-assigned one is named.
    expect(createFileStorage(parseEnv({ ...env, STORAGE_DRIVER: 'azure-blob', STORAGE_AZURE_ACCOUNT_URL: 'https://tcuploads.blob.core.windows.net' }))).toBeInstanceOf(AzureBlobStorage);
  });
});
