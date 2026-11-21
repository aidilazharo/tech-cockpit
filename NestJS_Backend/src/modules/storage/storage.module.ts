import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/env.module.js';
import type { Env } from '../../config/env.js';
import { createFileStorage, FILE_STORAGE } from './file-storage.js';

/** Where uploaded files are kept: the local folder in development, Azure Blob Storage when deployed. */
@Global()
@Module({
  providers: [{ provide: FILE_STORAGE, useFactory: (env: Env) => createFileStorage(env), inject: [ENV] }],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
