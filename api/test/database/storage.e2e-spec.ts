import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

import { HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Test } from '@nestjs/testing';

import { generationFolder, generationResultKey, userPhotoKey } from '../../src/storage/keys.js';
import { STORAGE_SETTINGS, storageProviders } from '../../src/storage/s3-client.provider.js';
import { StorageError } from '../../src/storage/storage.error.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import { createTestS3Client, testStorageSettings } from '../support/test-storage.js';

// Files share the emulator's bucket: every key of this file lies under these ids.
const USER = randomUUID();
const OTHER_USER = randomUUID();
const BODY = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);

describe('a storage error', () => {
  const settings = { ...testStorageSettings(), secretAccessKey: 'wrong-secret' };
  const userId = randomUUID();
  let service: StorageService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [...storageProviders, StorageService],
    })
      .overrideProvider(STORAGE_SETTINGS)
      .useValue(settings)
      .compile();
    service = moduleRef.get(StorageService);
  });

  afterAll(() => {
    service.onApplicationShutdown();
  });

  const calls = [
    ['exists', () => service.exists(`keep/users/${userId}/photos/x.webp`)],
    ['deletePrefix', () => service.deletePrefix(`keep/users/${userId}/`)],
  ] as const;

  async function failure(call: () => Promise<unknown>): Promise<Error> {
    const error: unknown = await call().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  }

  // Every string reachable from the error through its own properties, as a serializer that walks
  // the object would see them (the error holds its HTTP response, whose request holds the headers).
  function reachableStrings(root: unknown): string {
    const seen = new WeakSet<object>();
    const found: string[] = [];
    const visit = (value: unknown, depth: number): void => {
      if (typeof value === 'string') found.push(value);
      if (typeof value !== 'object' || value === null || depth > 12 || seen.has(value)) return;
      seen.add(value);
      if (Buffer.isBuffer(value)) found.push(value.toString('latin1'));
      for (const name of Object.getOwnPropertyNames(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (descriptor && 'value' in descriptor) visit(descriptor.value, depth + 1);
      }
    };
    visit(root, 0);
    return found.join('\n');
  }

  it.each(calls)('%s rejects with a message and fields free of keys and ids', async (_n, call) => {
    const error = await failure(call);

    // Everything but the HTTP response: what a log line or a Sentry event shows by default.
    const { $response: _response, ...fields } = error as Error & { $response?: unknown };
    const text = [error.name, error.message, error.stack, inspect(fields, { depth: 3 })].join('\n');
    for (const secret of [settings.accessKeyId, settings.secretAccessKey, userId, 'x.webp']) {
      expect(text).not.toContain(secret);
    }
  });

  it('exists fails with a StorageError of status 403', async () => {
    const error = await failure(calls[0][1]);

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ operation: 'HeadObject', status: 403 });
  });

  it('deletePrefix fails with a StorageError SignatureDoesNotMatch', async () => {
    const error = await failure(calls[1][1]);

    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({
      operation: 'ListObjectsV2',
      code: 'SignatureDoesNotMatch',
      status: 403,
    });
    expect(error.cause).toBeUndefined();
  });

  it.each(calls)('%s rejects with an object graph free of the access key id', async (_n, call) => {
    const error = await failure(call);

    expect(reachableStrings(error)).not.toContain(settings.accessKeyId);
  });
});

describe('storage against the emulator', () => {
  let testApp: TestApp;
  let storage: StorageService;
  let s3: S3Client;
  const { endpoint, bucket } = testStorageSettings();

  beforeAll(async () => {
    testApp = await createTestApp();
    storage = testApp.app.get(StorageService);
    s3 = createTestS3Client();
  });

  afterAll(async () => {
    s3.destroy();
    await testApp.close();
  });

  it('stores the type, cache control and owner of an object', async () => {
    const key = userPhotoKey(USER);
    await storage.put(key, BODY, {
      contentType: 'image/webp',
      cacheControl: 'private, max-age=60',
      ownerUserId: USER,
    });
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    expect(head.ContentType).toBe('image/webp');
    expect(head.CacheControl).toBe('private, max-age=60');
    expect(head.Metadata?.['owner-user-id']).toBe(USER);
  });

  it('exists is true after put and false for a missing key', async () => {
    const key = userPhotoKey(USER);
    await storage.put(key, BODY, { contentType: 'image/webp', ownerUserId: USER });
    await expect(storage.exists(key)).resolves.toBe(true);
    await expect(storage.exists(userPhotoKey(USER))).resolves.toBe(false);
  });

  it('deletePrefix clears more than a thousand keys and spares other folders', async () => {
    const generationId = randomUUID();
    const folder = generationFolder(USER, generationId);
    const total = 1005;
    for (let start = 0; start < total; start += 100) {
      await Promise.all(
        Array.from({ length: Math.min(100, total - start) }, (_, i) =>
          storage.put(`${folder}f${String(start + i)}.webp`, BODY, {
            contentType: 'image/webp',
            ownerUserId: USER,
          }),
        ),
      );
    }
    const sibling = generationResultKey(USER, randomUUID());
    const foreign = userPhotoKey(OTHER_USER);
    await storage.put(sibling, BODY, { contentType: 'image/webp', ownerUserId: USER });
    await storage.put(foreign, BODY, { contentType: 'image/webp', ownerUserId: OTHER_USER });

    await expect(storage.deletePrefix(folder)).resolves.toBe(total);

    await expect(storage.exists(`${folder}f0.webp`)).resolves.toBe(false);
    await expect(storage.exists(`${folder}f${String(total - 1)}.webp`)).resolves.toBe(false);
    await expect(storage.exists(sibling)).resolves.toBe(true);
    await expect(storage.exists(foreign)).resolves.toBe(true);
    await expect(storage.deletePrefix(folder)).resolves.toBe(0);
  }, 120_000);

  describe('signedUrl', () => {
    it('serves the object for 900 seconds', async () => {
      const key = userPhotoKey(USER);
      await storage.put(key, BODY, { contentType: 'image/webp', ownerUserId: USER });
      const url = await storage.signedUrl(key);
      expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('900');
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(BODY);
    });

    it('is refused once it has expired (AC8)', async () => {
      const key = userPhotoKey(USER);
      await storage.put(key, BODY, { contentType: 'image/webp', ownerUserId: USER });
      vi.useFakeTimers({ toFake: ['Date'] });
      let url: string;
      try {
        vi.setSystemTime(Date.now() - (900 + 120) * 1000);
        url = await storage.signedUrl(key);
      } finally {
        vi.useRealTimers();
      }
      const response = await fetch(url);
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('unsigned reads', () => {
    it('refuses a private object (AC7)', async () => {
      const key = userPhotoKey(USER);
      await storage.put(key, BODY, { contentType: 'image/webp', ownerUserId: USER });
      const response = await fetch(`${endpoint}/${bucket}/${key}`);
      expect(response.status).toBe(403);
    });

    it('serves a media object to anyone', async () => {
      const key = `media/test/${randomUUID()}.webp`;
      await storage.put(key, BODY, { contentType: 'image/webp' });
      const response = await fetch(`${endpoint}/${bucket}/${key}`);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(BODY);
    });
  });
});
