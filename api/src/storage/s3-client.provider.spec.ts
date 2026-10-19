import { createServer, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

import { HeadObjectCommand } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../config/env.js';
import {
  createS3Client,
  S3_CLIENT,
  S3_CONNECTION_TIMEOUT_MS,
  S3_SIGNING_CLIENT,
  S3_SOCKET_TIMEOUT_MS,
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
    service.onApplicationShutdown();
  });
});

describe('StorageService shutdown', () => {
  it('destroys both clients when the app closes, in onApplicationShutdown', async () => {
    const client = { destroy: vi.fn() };
    const signingClient = { destroy: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: STORAGE_SETTINGS, useValue: {} },
        { provide: S3_CLIENT, useValue: client },
        { provide: S3_SIGNING_CLIENT, useValue: signingClient },
        StorageService,
      ],
    }).compile();
    const service = moduleRef.get(StorageService);

    // onModuleDestroy would run while the HTTP server still takes requests.
    expect('onModuleDestroy' in service).toBe(false);
    expect(client.destroy).not.toHaveBeenCalled();

    await moduleRef.close();

    expect(client.destroy).toHaveBeenCalledOnce();
    expect(signingClient.destroy).toHaveBeenCalledOnce();
  });
});

describe('createS3Client', () => {
  it('uses path-style addresses and sends checksums only when required', async () => {
    const client = createS3Client(
      { region: 'ru-1', accessKeyId: 'k', secretAccessKey: 's' },
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

  it('limits the connection and the silence on the socket', async () => {
    const client = createS3Client(
      { region: 'ru-1', accessKeyId: 'k', secretAccessKey: 's' },
      'http://s3:8333',
    );
    const handler = client.config.requestHandler as unknown as {
      configProvider: Promise<{ connectionTimeout?: number; socketTimeout?: number }>;
    };

    const options = await handler.configProvider;

    expect(options.connectionTimeout).toBe(S3_CONNECTION_TIMEOUT_MS);
    expect(options.socketTimeout).toBe(S3_SOCKET_TIMEOUT_MS);
    expect(S3_CONNECTION_TIMEOUT_MS).toBe(5000);
    expect(S3_SOCKET_TIMEOUT_MS).toBe(10_000);
    client.destroy();
  });

  it('uses an explicit socket timeout and keeps the connection timeout', async () => {
    const client = createS3Client(
      { region: 'ru-1', accessKeyId: 'k', secretAccessKey: 's' },
      'http://s3:8333',
      60_000,
    );
    const handler = client.config.requestHandler as unknown as {
      configProvider: Promise<{ connectionTimeout?: number; socketTimeout?: number }>;
    };

    const options = await handler.configProvider;

    expect(options.socketTimeout).toBe(60_000);
    expect(options.connectionTimeout).toBe(S3_CONNECTION_TIMEOUT_MS);
    client.destroy();
  });

  it('fails a request to a server that accepts the connection and never answers', async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const endpoint = `http://127.0.0.1:${String(address.port)}`;
    const client = createS3Client(
      { region: 'ru-1', accessKeyId: 'k', secretAccessKey: 's' },
      endpoint,
    );
    // The SDK's own retries would repeat the wait; one attempt shows the bound.
    // A strategy that refuses every retry: the SDK then throws the attempt's own error.
    const noRetries = {
      acquireInitialRetryToken: () => Promise.resolve({ getRetryCount: () => 0 }),
      refreshRetryTokenForRetry: () => Promise.reject(new Error('no retry')),
      recordSuccess: () => {},
    };
    client.config.retryStrategy = (() =>
      Promise.resolve(noRetries)) as unknown as typeof client.config.retryStrategy;
    const began = Date.now();

    try {
      await expect(
        client.send(new HeadObjectCommand({ Bucket: 'bucket', Key: 'media/a.webp' })),
      ).rejects.toThrow();
      const elapsed = Date.now() - began;
      expect(elapsed).toBeGreaterThanOrEqual(S3_SOCKET_TIMEOUT_MS - 500);
      expect(elapsed).toBeLessThan(S3_SOCKET_TIMEOUT_MS + 2000);
    } finally {
      client.destroy();
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 20_000);
});
