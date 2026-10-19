import { S3Client } from '@aws-sdk/client-s3';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';

// What the storage module reads from the environment (spec 0011 plan §1). One provider, so the
// database tests replace it with their throwaway emulator's values (test/support/test-app.ts).
export interface StorageSettings {
  // The api's and the worker's address of the storage.
  endpoint: string;
  // The host signed links carry; the signature covers it, so it is the browser's address.
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  signedUrlTtlSeconds: number;
}

export const STORAGE_SETTINGS = Symbol('STORAGE_SETTINGS');
// The client of every request to the storage.
export const S3_CLIENT = Symbol('S3_CLIENT');
// A client built for the public endpoint that only signs links: no request ever goes through it.
export const S3_SIGNING_CLIENT = Symbol('S3_SIGNING_CLIENT');

export function storageSettings(config: ConfigService<Env, true>): StorageSettings {
  const endpoint = config.get('S3_ENDPOINT', { infer: true });
  return {
    endpoint,
    // Empty: the browser reaches the storage at the api's address (production).
    publicEndpoint: config.get('S3_PUBLIC_ENDPOINT', { infer: true }) || endpoint,
    region: config.get('S3_REGION', { infer: true }),
    bucket: config.get('S3_BUCKET', { infer: true }),
    accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
    secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
    signedUrlTtlSeconds: config.get('S3_SIGNED_URL_TTL_SECONDS', { infer: true }),
  };
}

export const S3_CONNECTION_TIMEOUT_MS = 5000;
export const S3_SOCKET_TIMEOUT_MS = 10_000;

// The keys and the region only: the backup job (backup/config.ts) builds its clients with keys of
// its own and a longer socket timeout (spec 0012 plan §1, P18).
export function createS3Client(
  settings: Pick<StorageSettings, 'region' | 'accessKeyId' | 'secretAccessKey'>,
  endpoint: string,
  socketTimeout = S3_SOCKET_TIMEOUT_MS,
): S3Client {
  return new S3Client({
    endpoint,
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    // Path-style addresses (`<endpoint>/<bucket>/<key>`): the emulator has no bucket subdomains.
    forcePathStyle: true,
    // Since 3.729 the SDK adds CRC checksums to every request by default, which several
    // S3-compatible services refuse; only operations that require one send it (plan §2).
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    // The SDK waits without limit by default: a storage that does not answer would hold a request
    // (and an activity's attempt, past its 30 s startToCloseTimeout) for good. socketTimeout is the
    // longest silence on the socket, not a bound on the whole transfer (a slow upload of the seed
    // goes on). Not requestTimeout: without throwOnRequestTimeout it only logs a warning.
    requestHandler: {
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      socketTimeout,
    },
  });
}

export const storageProviders: Provider[] = [
  { provide: STORAGE_SETTINGS, inject: [ConfigService], useFactory: storageSettings },
  {
    provide: S3_CLIENT,
    inject: [STORAGE_SETTINGS],
    useFactory: (settings: StorageSettings) => createS3Client(settings, settings.endpoint),
  },
  {
    provide: S3_SIGNING_CLIENT,
    inject: [STORAGE_SETTINGS],
    useFactory: (settings: StorageSettings) => createS3Client(settings, settings.publicEndpoint),
  },
];
