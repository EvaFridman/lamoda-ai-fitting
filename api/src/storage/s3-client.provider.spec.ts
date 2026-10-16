import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../config/env.js';
import {
  createS3Client,
  STORAGE_SETTINGS,
  type StorageSettings,
  storageProviders,
  storageSettings,
} from './s3-client.provider.js';
import { StorageService } from './storage.service.js';

function configOf(values: Record<string, unknown>): ConfigService<Env, true> {
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

const ENV = {
  S3_ENDPOINT: 'http://s3:8333',
  S3_PUBLIC_ENDPOINT: '',
  S3_REGION: 'ru-1',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key-id',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_SIGNED_URL_TTL_SECONDS: 600,
};

describe('storageSettings', () => {
  it('maps the environment to the settings', () => {
    expect(storageSettings(configOf(ENV))).toEqual({
      endpoint: 'http://s3:8333',
      publicEndpoint: 'http://s3:8333',
      region: 'ru-1',
      bucket: 'bucket',
      accessKeyId: 'key-id',
      secretAccessKey: 'secret',
      signedUrlTtlSeconds: 600,
    });
  });

  it('falls back to the endpoint when the public one is empty', () => {
    expect(storageSettings(configOf(ENV)).publicEndpoint).toBe('http://s3:8333');
  });

  it('keeps a public endpoint that is set', () => {
    const settings = storageSettings(
      configOf({ ...ENV, S3_PUBLIC_ENDPOINT: 'http://localhost:8333' }),
    );
    expect(settings.endpoint).toBe('http://s3:8333');
    expect(settings.publicEndpoint).toBe('http://localhost:8333');
  });
});

describe('signed links', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('are signed for the public endpoint, path-style, without a request', async () => {
    const settings: StorageSettings = {
      endpoint: 'http://s3:8333',
      publicEndpoint: 'http://localhost:8333',
      region: 'ru-1',
      bucket: 'bucket',
      accessKeyId: 'key-id',
      secretAccessKey: 'secret',
      signedUrlTtlSeconds: 777,
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const moduleRef = await Test.createTestingModule({
      providers: [...storageProviders, StorageService],
    })
      .overrideProvider(STORAGE_SETTINGS)
      .useValue(settings)
      .compile();
    const service = moduleRef.get(StorageService);

    const url = new URL(await service.signedUrl('keep/users/u1/photos/a.webp'));

    expect(url.origin).toBe('http://localhost:8333');
    expect(url.pathname).toBe('/bucket/keep/users/u1/photos/a.webp');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('777');
    expect(fetchSpy).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});

describe('createS3Client', () => {
  it('uses path-style addresses and sends checksums only when required', async () => {
    const client = createS3Client(
      {
        endpoint: 'http://s3:8333',
        publicEndpoint: 'http://s3:8333',
        region: 'ru-1',
        bucket: 'bucket',
        accessKeyId: 'k',
        secretAccessKey: 's',
        signedUrlTtlSeconds: 900,
      },
      'http://s3:8333',
    );
    const resolve = async (value: unknown): Promise<unknown> =>
      typeof value === 'function' ? (value as () => unknown)() : value;
    const config = client.config as unknown as Record<string, unknown>;
    await expect(resolve(config['forcePathStyle'])).resolves.toBe(true);
    await expect(resolve(config['requestChecksumCalculation'])).resolves.toBe('WHEN_REQUIRED');
    await expect(resolve(config['responseChecksumValidation'])).resolves.toBe('WHEN_REQUIRED');
    client.destroy();
  });
});
