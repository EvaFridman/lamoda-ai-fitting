import type { S3Client } from '@aws-sdk/client-s3';
import { inject } from 'vitest';

import { createS3Client, type StorageSettings } from '../../src/storage/s3-client.provider.js';
import { StorageService } from '../../src/storage/storage.service.js';

// The storage settings of the throwaway emulator (storage.ts), for specs under test/database/.
// The test reaches the emulator at the address links are signed for, as a browser would. Files
// share the bucket, so each puts its objects under keys of its own (a random user id).
export function testStorageSettings(): StorageSettings {
  const storage = inject('storage');
  return { ...storage, publicEndpoint: storage.endpoint, signedUrlTtlSeconds: 900 };
}

// A client of the emulator, built the way the app builds its own: for arranging and checking
// objects. `destroy()` it in `afterAll`.
export function createTestS3Client(): S3Client {
  const settings = testStorageSettings();
  return createS3Client(settings, settings.endpoint);
}

// A StorageService of the emulator outside the app, for a test worker's activities
// (test-temporal.ts). `endpoint` replaces the emulator's address, e.g. a TcpProxy's (tcp-proxy.ts)
// to make the storage unreachable. Its clients end with `onModuleDestroy()`, in `afterAll`.
export function createTestStorageService(endpoint?: string): StorageService {
  const settings = testStorageSettings();
  const reached = { ...settings, endpoint: endpoint ?? settings.endpoint };
  return new StorageService(
    reached,
    createS3Client(reached, reached.endpoint),
    createS3Client(reached, reached.publicEndpoint),
  );
}
