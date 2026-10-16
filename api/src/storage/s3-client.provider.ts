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

export function createS3Client(settings: StorageSettings, endpoint: string): S3Client {
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
