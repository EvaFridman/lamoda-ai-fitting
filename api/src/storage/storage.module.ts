import { Module } from '@nestjs/common';

import { storageProviders } from './s3-client.provider.js';
import { StorageService } from './storage.service.js';

// The app's bucket (spec 0011). Imported by AppModule, SeedModule and WorkerModule; the clients are
// created when the module starts and make no request until a method is called, so a process starts
// even while the storage is down.
@Module({
  providers: [...storageProviders, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
