import { randomUUID } from 'node:crypto';

import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AI_PROVIDER, type FakeAiProvider } from '../../src/ai/ai-provider.js';
import { AI_SETTINGS, aiSettings } from '../../src/ai/ai-settings.js';
import type { Auth } from '../../src/auth/auth.js';
import { AUTH } from '../../src/auth/auth.module.js';
import type { Env } from '../../src/config/env.js';
import { goodPhoto, refusedPhoto } from '../support/photos.js';
import { signIn, type SignedIn } from '../support/sign-in.js';
import { StorageError } from '../../src/storage/storage.error.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import { FileDeletion } from '../../src/temporal/file-deletion.js';
import { WorkflowStarter } from '../../src/temporal/workflow-starter.js';
import {
  createTestS3Client,
  createTestStorageService,
  testStorageSettings,
} from '../support/test-storage.js';
import {
  startTestWorker,
  testTemporalSettings,
  type TestWorker,
} from '../support/test-temporal.js';

interface Detail {
  field: string;
  code: string;
  message: string;
}
interface ErrorBody {
  error: { code: string; message: string; details: Detail[] };
}
interface PhotoBody {
  id: string;
  url: string | null;
  isDefault: boolean;
  transient: boolean;
  width: number;
  height: number;
  createdAt: string;
}

const REASONS = ['dark', 'not_full', 'many_people', 'child', 'no_person', 'moderation'] as const;

describe('POST /me/photos (spec 0019 AC1, AC3, AC4, A45)', () => {
  const { bucket } = testStorageSettings();
  let testApp: TestApp;
  let s3: S3Client;
  let fake: FakeAiProvider;
  let workerStorage: StorageService;
  let worker: TestWorker;
  const temporal = testTemporalSettings();

  beforeAll(async () => {
    s3 = createTestS3Client();
    testApp = await createTestApp({
      access: 'production',
      temporal,
      // A short check deadline, so a timed-out check does not take seconds.
      override: (builder) =>
        builder.overrideProvider(AI_SETTINGS).useFactory({
          inject: [ConfigService],
          factory: (config: ConfigService<Env, true>) => ({
            ...aiSettings(config),
            checkTimeoutMs: 100,
          }),
        }),
    });
    fake = testApp.app.get<FakeAiProvider>(AI_PROVIDER);
    workerStorage = createTestStorageService();
    worker = await startTestWorker(temporal, workerStorage, testApp.prisma);
  }, 120_000);

  afterAll(async () => {
    await worker.stop();
    await testApp.close();
    workerStorage.onApplicationShutdown();
    s3.destroy();
  });

  const http = () => request(testApp.app.getHttpServer());

  function post(who: SignedIn | null, file: Buffer, save?: string, filename = 'a.jpg') {
    const req = http().post('/me/photos');
    if (who !== null) req.set({ Cookie: who.cookie });
    req.attach('photo', file, { filename, contentType: 'image/jpeg' });
    if (save !== undefined) req.field('save', save);
    return req;
  }

  async function keysOf(userId: string): Promise<string[]> {
    const found = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `keep/users/${userId}/` }),
    );
    return (found.Contents ?? []).map((object) => object.Key ?? '');
  }

  const rowsOf = (userId: string) => testApp.prisma.userPhoto.findMany({ where: { userId } });

  async function expectNothingStored(who: SignedIn) {
    expect(await rowsOf(who.userId)).toEqual([]);
    expect(await keysOf(who.userId)).toEqual([]);
  }

  function errorOf(response: request.Response): ErrorBody['error'] {
    return (response.body as ErrorBody).error;
  }

  it('stores a good JPEG as WebP and answers 201 with the photo (AC1)', async () => {
    const who = await signIn(testApp.app);

    const response = await post(who, await goodPhoto({ width: 64, height: 96 }));

    expect(response.status).toBe(201);
    const body = response.body as PhotoBody;
    expect(body).toMatchObject({ isDefault: true, transient: false, width: 64, height: 96 });
    expect(new Date(body.createdAt).getTime()).not.toBeNaN();
    expect(Object.keys(body).sort()).toEqual(
      ['createdAt', 'height', 'id', 'isDefault', 'transient', 'url', 'width'].sort(),
    );
    const rows = await rowsOf(who.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: body.id,
      isDefault: true,
      transient: false,
      width: 64,
      height: 96,
    });
    expect(rows[0]?.imageKey.startsWith(`keep/users/${who.userId}/photos/`)).toBe(true);
    expect(await keysOf(who.userId)).toEqual([rows[0]?.imageKey]);
    expect(body.url).toContain(rows[0]?.imageKey);
  });

  it('serves the stored photo through the signed link as WebP', async () => {
    const who = await signIn(testApp.app);
    const body = (await post(who, await goodPhoto({ width: 40, height: 30 }))).body as PhotoBody;

    const fetched = await fetch(body.url ?? '');

    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await fetched.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 40, height: 30 });
  });

  it('stores the object with the content type image/webp', async () => {
    const who = await signIn(testApp.app);
    await post(who, await goodPhoto({ format: 'png' })).expect(201);
    const [key] = await keysOf(who.userId);

    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

    expect(object.ContentType).toBe('image/webp');
  });

  it('turns and shrinks the upload: orientation applied, at most 2048 px', async () => {
    const who = await signIn(testApp.app);

    const turned = await post(who, await goodPhoto({ width: 64, height: 32, orientation: 6 }));
    const big = await post(who, await goodPhoto({ width: 3000, height: 1000 }));

    expect(turned.body).toMatchObject({ width: 32, height: 64 });
    expect(big.body).toMatchObject({ width: 2048, height: 683 });
  });

  it('makes the first saved photo the default and not the second', async () => {
    const who = await signIn(testApp.app);

    const first = await post(who, await goodPhoto()).expect(201);
    const second = await post(who, await goodPhoto()).expect(201);

    expect((first.body as PhotoBody).isDefault).toBe(true);
    expect((second.body as PhotoBody).isDefault).toBe(false);
    expect((await rowsOf(who.userId)).filter((row) => row.isDefault)).toHaveLength(1);
  });

  it('makes the next saved photo the default after the default was deleted', async () => {
    const who = await signIn(testApp.app);
    const first = (await post(who, await goodPhoto()).expect(201)).body as PhotoBody;
    await testApp.prisma.userPhoto.delete({ where: { id: first.id } });

    const next = await post(who, await goodPhoto()).expect(201);

    expect((next.body as PhotoBody).isDefault).toBe(true);
  });

  it('keeps photos of each user apart', async () => {
    const [one, two] = [await signIn(testApp.app), await signIn(testApp.app)];

    const first = await post(one, await goodPhoto()).expect(201);
    const second = await post(two, await goodPhoto()).expect(201);

    expect((first.body as PhotoBody).isDefault).toBe(true);
    expect((second.body as PhotoBody).isDefault).toBe(true);
    expect(await keysOf(one.userId)).toHaveLength(1);
    expect(await keysOf(two.userId)).toHaveLength(1);
  });

  it('accepts save=true as the default', async () => {
    const who = await signIn(testApp.app);

    const response = await post(who, await goodPhoto(), 'true');

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ transient: false, isDefault: true });
  });

  it('stores save=false as a transient photo, not the default (A24)', async () => {
    const who = await signIn(testApp.app);

    const response = await post(who, await goodPhoto(), 'false');

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ transient: true, isDefault: false });
    const rows = await rowsOf(who.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ transient: true, isDefault: false });
    expect(await keysOf(who.userId)).toHaveLength(1);
  });

  it('leaves the default to the first saved photo after a transient one', async () => {
    const who = await signIn(testApp.app);
    await post(who, await goodPhoto(), 'false').expect(201);

    const saved = await post(who, await goodPhoto()).expect(201);

    expect((saved.body as PhotoBody).isDefault).toBe(true);
  });

  it('answers 400 VALIDATION_FAILED for a save that is not true or false', async () => {
    const who = await signIn(testApp.app);

    const response = await post(who, await goodPhoto(), 'maybe');

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    expect(errorOf(response).details).toContainEqual(
      expect.objectContaining({ field: 'save', code: 'IS_BOOLEAN' }),
    );
    await expectNothingStored(who);
  });

  it('answers 400 for a field it does not know and stores nothing', async () => {
    const who = await signIn(testApp.app);

    const response = await post(who, await goodPhoto()).field('userId', randomUUID());

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toContainEqual(
      expect.objectContaining({ field: 'userId', code: 'WHITELIST_VALIDATION' }),
    );
    await expectNothingStored(who);
  });

  describe.each(REASONS)('a photo the check refuses as %s (AC3)', (reason) => {
    it('answers 400 PHOTO_REFUSED with the reason and stores nothing', async () => {
      const who = await signIn(testApp.app);

      const response = await post(who, await refusedPhoto(reason));

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe('VALIDATION_FAILED');
      expect(errorOf(response).details).toEqual([
        expect.objectContaining({ field: 'photo', code: 'PHOTO_REFUSED' }),
      ]);
      expect(errorOf(response).details[0]?.message).toContain(reason);
      await expectNothingStored(who);
    });
  });

  it('refuses a solid-colour photo in PNG too, and one-time', async () => {
    const who = await signIn(testApp.app);

    const response = await post(who, await refusedPhoto('child', { format: 'png' }), 'false');

    expect(response.status).toBe(400);
    expect(errorOf(response).details[0]?.message).toContain('child');
    await expectNothingStored(who);
  });

  it('answers 400 IS_IMAGE for a text file and stores nothing (AC4)', async () => {
    const who = await signIn(testApp.app);

    const response = await post(who, Buffer.from('hello, not an image'), undefined, 'a.txt');

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    expect(errorOf(response).details).toEqual([
      expect.objectContaining({ field: 'photo', code: 'IS_IMAGE' }),
    ]);
    await expectNothingStored(who);
  });

  it('answers 400 IS_IMAGE for a GIF named .jpg', async () => {
    const who = await signIn(testApp.app);
    const gif = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 5, g: 6, b: 7 } },
    })
      .gif()
      .toBuffer();

    const response = await post(who, gif);

    expect(response.status).toBe(400);
    expect(errorOf(response).details[0]).toMatchObject({ field: 'photo', code: 'IS_IMAGE' });
    await expectNothingStored(who);
  });

  it('answers 400 IS_IMAGE for a form with no photo', async () => {
    const who = await signIn(testApp.app);

    const response = await http()
      .post('/me/photos')
      .set({ Cookie: who.cookie })
      .field('save', 'true');

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      expect.objectContaining({ field: 'photo', code: 'IS_IMAGE' }),
    ]);
  });

  it('answers 400 with the IS_IMAGE detail for a JSON body', async () => {
    const who = await signIn(testApp.app);

    const response = await http()
      .post('/me/photos')
      .set({ Cookie: who.cookie })
      .send({ photo: 'abc', save: true });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    expect(errorOf(response).details).toEqual([
      expect.objectContaining({ field: 'photo', code: 'IS_IMAGE' }),
    ]);
    await expectNothingStored(who);
  });

  it('answers 413 PAYLOAD_TOO_LARGE for a 21 MB body and stores nothing (AC4)', async () => {
    const who = await signIn(testApp.app);

    const response = await post(who, Buffer.alloc(21 * 1024 * 1024, 1));

    expect(response.status).toBe(413);
    expect(errorOf(response).code).toBe('PAYLOAD_TOO_LARGE');
    await expectNothingStored(who);
  }, 30_000);

  it('answers 409 LIMIT_REACHED for the sixth saved photo and stores nothing more', async () => {
    const who = await signIn(testApp.app);
    for (let index = 0; index < 5; index++) {
      await post(who, await goodPhoto()).expect(201);
    }

    const response = await post(who, await goodPhoto());

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe('LIMIT_REACHED');
    expect(await rowsOf(who.userId)).toHaveLength(5);
    expect(await keysOf(who.userId)).toHaveLength(5);
  });

  it('refuses the sixth saved photo before the check (a refused photo is also 409)', async () => {
    const who = await signIn(testApp.app);
    for (let index = 0; index < 5; index++) {
      await post(who, await goodPhoto()).expect(201);
    }

    const response = await post(who, await refusedPhoto('dark'));

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe('LIMIT_REACHED');
  });

  it('still takes a transient photo after five saved ones, and does not count it', async () => {
    const who = await signIn(testApp.app);
    for (let index = 0; index < 5; index++) {
      await post(who, await goodPhoto()).expect(201);
    }

    const transient = await post(who, await goodPhoto(), 'false');

    expect(transient.status).toBe(201);
    expect(transient.body).toMatchObject({ transient: true, isDefault: false });
    expect(await rowsOf(who.userId)).toHaveLength(6);
  });

  it('does not count transient photos toward the five', async () => {
    const who = await signIn(testApp.app);
    for (let index = 0; index < 5; index++) {
      await post(who, await goodPhoto(), 'false').expect(201);
    }

    const saved = await post(who, await goodPhoto());

    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ transient: false, isDefault: true });
  });

  it('frees a place when a saved photo is deleted', async () => {
    const who = await signIn(testApp.app);
    const first = (await post(who, await goodPhoto()).expect(201)).body as PhotoBody;
    for (let index = 0; index < 4; index++) {
      await post(who, await goodPhoto()).expect(201);
    }
    await post(who, await goodPhoto()).expect(409);
    await testApp.prisma.userPhoto.delete({ where: { id: first.id } });

    await post(who, await goodPhoto()).expect(201);
  });

  it('holds the limit under parallel uploads (the user row is locked)', async () => {
    const who = await signIn(testApp.app);
    const photo = await goodPhoto();

    const responses = await Promise.all(Array.from({ length: 8 }, () => post(who, photo)));

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(5);
    expect(statuses.filter((status) => status === 409)).toHaveLength(3);
    expect(await rowsOf(who.userId)).toHaveLength(5);
    expect((await rowsOf(who.userId)).filter((row) => row.isDefault)).toHaveLength(1);
  });

  describe('a check that does not answer in time (A45)', () => {
    it('answers 503 SERVICE_UNAVAILABLE and stores nothing', async () => {
      const who = await signIn(testApp.app);
      fake.delayMs = 2000;
      try {
        const response = await post(who, await goodPhoto());

        expect(response.status).toBe(503);
        expect(errorOf(response).code).toBe('SERVICE_UNAVAILABLE');
      } finally {
        fake.delayMs = 0;
      }
      await expectNothingStored(who);
    });

    it('works again once the check answers', async () => {
      const who = await signIn(testApp.app);

      await post(who, await goodPhoto()).expect(201);
    });
  });

  describe('a bucket that does not take the photo', () => {
    it('answers 503 SERVICE_UNAVAILABLE and leaves no row', async () => {
      const who = await signIn(testApp.app);
      const put = vi
        .spyOn(testApp.app.get(StorageService), 'put')
        .mockRejectedValueOnce(new StorageError('PutObject', 'TimeoutError', undefined, undefined));

      const response = await post(who, await goodPhoto());

      put.mockRestore();
      expect(response.status).toBe(503);
      expect(errorOf(response).code).toBe('SERVICE_UNAVAILABLE');
      await expectNothingStored(who);
    });

    it('does not turn another failure of the write into a 503', async () => {
      const who = await signIn(testApp.app);
      const put = vi
        .spyOn(testApp.app.get(StorageService), 'put')
        .mockRejectedValueOnce(new Error('boom'));

      const response = await post(who, await goodPhoto());

      put.mockRestore();
      expect(response.status).toBe(500);
      expect(await rowsOf(who.userId)).toEqual([]);
    });

    it('writes under a time limit: the signal is not yet aborted', async () => {
      const who = await signIn(testApp.app);
      const put = vi.spyOn(testApp.app.get(StorageService), 'put');

      await post(who, await goodPhoto()).expect(201);

      const options = put.mock.calls[0]?.[2];
      put.mockRestore();
      expect(options?.abortSignal).toBeInstanceOf(AbortSignal);
      expect(options?.abortSignal?.aborted).toBe(false);
    });

    it('answers 503 and stores nothing when the write is aborted', async () => {
      const who = await signIn(testApp.app);
      const storage = testApp.app.get(StorageService);
      const original = storage.put.bind(storage);
      const put = vi
        .spyOn(storage, 'put')
        .mockImplementationOnce((key, body, options) =>
          original(key, body, { ...options, abortSignal: AbortSignal.abort() }),
        );

      const response = await post(who, await goodPhoto());

      put.mockRestore();
      expect(response.status).toBe(503);
      await expectNothingStored(who);
    });
  });

  describe('without a session or with a gone user', () => {
    it('answers 401 for a gone user before the check runs, and stores nothing', async () => {
      const who = await signIn(testApp.app);
      const { authCookies } = await testApp.app.get<Auth>(AUTH).$context;
      const session = await http().get('/api/auth/get-session').set({ Cookie: who.cookie });
      const data = (session.headers['set-cookie'] as string[] | undefined)
        ?.find((line) => line.startsWith(`${authCookies.sessionData.name}=`))
        ?.split(';')[0];
      await testApp.prisma.user.delete({ where: { id: who.userId } });
      const check = vi.spyOn(fake, 'checkPhoto');

      const response = await http()
        .post('/me/photos')
        .set({ Cookie: `${who.cookie}; ${data}` })
        .attach('photo', await goodPhoto(), { filename: 'a.jpg' });

      const called = check.mock.calls.length;
      check.mockRestore();
      expect(response.status).toBe(401);
      expect(called).toBe(0);
      expect(await keysOf(who.userId)).toEqual([]);
    });

    it('answers 401 UNAUTHORIZED to an anonymous visitor and stores nothing', async () => {
      const response = await post(null, await goodPhoto());

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
    });

    it('answers 401 for a garbage session cookie', async () => {
      const names = (await testApp.app.get<Auth>(AUTH).$context).authCookies;

      const response = await http()
        .post('/me/photos')
        .set({ Cookie: `${names.sessionToken.name}=garbage` })
        .attach('photo', await goodPhoto(), { filename: 'a.jpg' });

      expect(response.status).toBe(401);
    });

    it('answers 401 with the session cookies expired when the user row is gone', async () => {
      const who = await signIn(testApp.app);
      const { authCookies } = await testApp.app.get<Auth>(AUTH).$context;
      const session = await http().get('/api/auth/get-session').set({ Cookie: who.cookie });
      const data = (session.headers['set-cookie'] as string[] | undefined)
        ?.find((line) => line.startsWith(`${authCookies.sessionData.name}=`))
        ?.split(';')[0];
      expect(data, 'the cached session copy').toBeTruthy();
      await testApp.prisma.user.delete({ where: { id: who.userId } });

      const response = await http()
        .post('/me/photos')
        .set({ Cookie: `${who.cookie}; ${data}` })
        .attach('photo', await goodPhoto(), { filename: 'a.jpg' });

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
      const headers = (response.headers['set-cookie'] as string[] | undefined) ?? [];
      for (const name of [
        authCookies.sessionToken.name,
        authCookies.sessionData.name,
        authCookies.dontRememberToken.name,
      ]) {
        const header = headers.find((line) => line.startsWith(`${name}=;`));
        expect(header, name).toBeDefined();
        expect(header).toMatch(/Expires=Thu, 01 Jan 1970/);
      }
      expect(await keysOf(who.userId)).toEqual([]);
    });
  });

  // A signed-in user with `count` saved photos, the first the default.
  async function withPhotos(count: number, save = 'true'): Promise<[SignedIn, PhotoBody[]]> {
    const who = await signIn(testApp.app);
    const photos: PhotoBody[] = [];
    for (let index = 0; index < count; index++) {
      photos.push((await post(who, await goodPhoto(), save).expect(201)).body as PhotoBody);
    }
    return [who, photos];
  }

  // The cookie header of a user whose row is gone but whose signed session copy still passes
  // (spec 0013 N31): the request then reaches the route.
  async function cookieOfGoneUser(who: SignedIn): Promise<string> {
    const { authCookies } = await testApp.app.get<Auth>(AUTH).$context;
    const session = await http().get('/api/auth/get-session').set({ Cookie: who.cookie });
    const data = (session.headers['set-cookie'] as string[] | undefined)
      ?.find((line) => line.startsWith(`${authCookies.sessionData.name}=`))
      ?.split(';')[0];
    expect(data, 'the cached session copy').toBeTruthy();
    await testApp.prisma.user.delete({ where: { id: who.userId } });
    return `${who.cookie}; ${data}`;
  }

  async function expectSessionCookiesExpired(response: request.Response) {
    const { authCookies } = await testApp.app.get<Auth>(AUTH).$context;
    const headers = (response.headers['set-cookie'] as string[] | undefined) ?? [];
    for (const name of [
      authCookies.sessionToken.name,
      authCookies.sessionData.name,
      authCookies.dontRememberToken.name,
    ]) {
      const header = headers.find((line) => line.startsWith(`${name}=;`));
      expect(header, name).toBeDefined();
      expect(header).toMatch(/Expires=Thu, 01 Jan 1970/);
    }
  }

  const get = (who: SignedIn | null) => {
    const req = http().get('/me/photos');
    return who === null ? req : req.set({ Cookie: who.cookie });
  };
  const patch = (who: SignedIn | null, id: string, body: object = { isDefault: true }) => {
    const req = http().patch(`/me/photos/${id}`);
    return (who === null ? req : req.set({ Cookie: who.cookie })).send(body);
  };
  const remove = (who: SignedIn | null, id: string) => {
    const req = http().delete(`/me/photos/${id}`);
    return who === null ? req : req.set({ Cookie: who.cookie });
  };

  describe('GET /me/photos', () => {
    it('answers an empty array for a user with no photos', async () => {
      const who = await signIn(testApp.app);

      const response = await get(who);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('lists the saved photos oldest first with signed links, and not the one-time ones (AC3)', async () => {
      const [who, photos] = await withPhotos(3);
      await post(who, await goodPhoto(), 'false').expect(201);

      const response = await get(who);

      expect(response.status).toBe(200);
      const body = response.body as PhotoBody[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.map((photo) => photo.id)).toEqual(photos.map((photo) => photo.id));
      expect(body.map((photo) => photo.isDefault)).toEqual([true, false, false]);
      expect(body.every((photo) => !photo.transient)).toBe(true);
      expect(body.every((photo) => typeof photo.url === 'string')).toBe(true);
      expect((await fetch(body[0]?.url ?? '')).status).toBe(200);
    });

    it('lists only the own photos', async () => {
      const [, mine] = await withPhotos(1);
      const [other] = await withPhotos(2);

      const body = (await get(other)).body as PhotoBody[];

      expect(body).toHaveLength(2);
      expect(body.map((photo) => photo.id)).not.toContain(mine[0]?.id);
    });

    it('answers 401 UNAUTHORIZED to an anonymous visitor', async () => {
      const response = await get(null);

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
    });

    it('answers an empty array for a user whose row is gone', async () => {
      const [who] = await withPhotos(1);
      const cookie = await cookieOfGoneUser(who);

      const response = await http().get('/me/photos').set({ Cookie: cookie });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('PATCH /me/photos/:id (AC3)', () => {
    it('makes another saved photo the default and clears the previous one', async () => {
      const [who, [first, second]] = await withPhotos(2);

      const response = await patch(who, second?.id ?? '');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: second?.id, isDefault: true, transient: false });
      const rows = await rowsOf(who.userId);
      expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([second?.id]);
      expect(rows.find((row) => row.id === first?.id)?.isDefault).toBe(false);
      const listed = (await get(who)).body as PhotoBody[];
      expect(listed.map((photo) => [photo.id, photo.isDefault])).toEqual([
        [first?.id, false],
        [second?.id, true],
      ]);
    });

    it('keeps the default when it is made the default again', async () => {
      const [who, [first]] = await withPhotos(2);

      const response = await patch(who, first?.id ?? '');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: first?.id, isDefault: true });
      expect((await rowsOf(who.userId)).filter((row) => row.isDefault)).toHaveLength(1);
    });

    it('answers 400 IS_IN on isDefault for false, and changes nothing', async () => {
      const [who, [first]] = await withPhotos(1);

      const response = await patch(who, first?.id ?? '', { isDefault: false });

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe('VALIDATION_FAILED');
      expect(errorOf(response).details).toContainEqual(
        expect.objectContaining({ field: 'isDefault', code: 'IS_IN' }),
      );
      expect((await rowsOf(who.userId))[0]?.isDefault).toBe(true);
    });

    it('answers 400 for an empty body', async () => {
      const [who, [first]] = await withPhotos(1);

      const response = await patch(who, first?.id ?? '', {});

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    });

    it('answers 400 WHITELIST_VALIDATION for a field it does not know', async () => {
      const [who, [first]] = await withPhotos(1);

      const response = await patch(who, first?.id ?? '', { isDefault: true, transient: true });

      expect(response.status).toBe(400);
      expect(errorOf(response).details).toContainEqual(
        expect.objectContaining({ field: 'transient', code: 'WHITELIST_VALIDATION' }),
      );
      expect((await rowsOf(who.userId))[0]?.transient).toBe(false);
    });

    it('answers 404 NOT_FOUND for a one-time photo', async () => {
      const [who, [transient]] = await withPhotos(1, 'false');

      const response = await patch(who, transient?.id ?? '');

      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe('NOT_FOUND');
      expect((await rowsOf(who.userId))[0]?.isDefault).toBe(false);
    });

    it('answers 404 for another user’s photo and changes nothing', async () => {
      const [, [, theirs]] = await withPhotos(2);
      const [me] = await withPhotos(1);

      const response = await patch(me, theirs?.id ?? '');

      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe('NOT_FOUND');
      const row = await testApp.prisma.userPhoto.findUnique({ where: { id: theirs?.id } });
      expect(row?.isDefault).toBe(false);
    });

    it('keeps the earlier default when the photo is not found', async () => {
      const [who] = await withPhotos(2);

      await patch(who, randomUUID()).expect(404);

      const rows = await rowsOf(who.userId);
      expect(rows.filter((row) => row.isDefault)).toHaveLength(1);
    });

    it('answers 400 for an id that is not a uuid', async () => {
      const who = await signIn(testApp.app);

      const response = await patch(who, 'not-a-uuid');

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe('INVALID_ID');
    });

    it('answers 401 to an anonymous visitor', async () => {
      const response = await patch(null, randomUUID());

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
    });

    it('answers 401 with the session cookies expired when the user row is gone', async () => {
      const [who, [first]] = await withPhotos(1);
      const cookie = await cookieOfGoneUser(who);

      const response = await http()
        .patch(`/me/photos/${first?.id ?? ''}`)
        .set({ Cookie: cookie })
        .send({ isDefault: true });

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
      await expectSessionCookiesExpired(response);
    });

    it('leaves exactly one default under parallel changes (the user row is locked)', async () => {
      const [who, photos] = await withPhotos(4);

      const responses = await Promise.all(photos.map((photo) => patch(who, photo.id)));

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
      expect((await rowsOf(who.userId)).filter((row) => row.isDefault)).toHaveLength(1);
    });
  });

  describe('DELETE /me/photos/:id (AC1, AC3, A54)', () => {
    it('answers 204, removes the row and the file, and the link answers 404 (AC1)', async () => {
      const [who, [photo]] = await withPhotos(1);

      await remove(who, photo?.id ?? '').expect(204);

      expect(await rowsOf(who.userId)).toEqual([]);
      await vi.waitFor(async () => expect(await keysOf(who.userId)).toEqual([]), {
        timeout: 30_000,
        interval: 250,
      });
      expect((await fetch(photo?.url ?? '')).status).toBe(404);
      expect((await get(who)).body).toEqual([]);
    });

    it('writes an outbox row of the kind photo with the photo’s key, then the worker removes it', async () => {
      const [who, [photo]] = await withPhotos(1);
      const key = (await rowsOf(who.userId))[0]?.imageKey ?? '';
      const fileDeletion = testApp.app.get(FileDeletion);
      const start = vi.spyOn(fileDeletion, 'start').mockResolvedValueOnce();

      await remove(who, photo?.id ?? '').expect(204);

      start.mockRestore();
      const [queued] = await testApp.prisma.fileDeletion.findMany({
        where: { rowId: photo?.id },
      });
      expect(queued).toMatchObject({
        kind: 'photo',
        rowId: photo?.id,
        prefixes: [key],
        startedAt: null,
      });
      expect(await keysOf(who.userId)).toEqual([key]);
      await fileDeletion.start({
        id: queued?.id ?? '',
        kind: 'photo',
        rowId: photo?.id ?? '',
        prefixes: [key],
      });
      await vi.waitFor(
        async () => {
          expect(await keysOf(who.userId)).toEqual([]);
          expect(
            await testApp.prisma.fileDeletion.findMany({ where: { rowId: photo?.id } }),
          ).toEqual([]);
        },
        { timeout: 30_000, interval: 250 },
      );
    });

    it('deletes only that photo’s file and keeps the others’', async () => {
      const [who, [first, second]] = await withPhotos(2);
      const keys = (await rowsOf(who.userId)).map((row) => row.imageKey);
      const doomed = (await rowsOf(who.userId)).find((row) => row.id === second?.id)?.imageKey;

      await remove(who, second?.id ?? '').expect(204);

      await vi.waitFor(
        async () => expect(await keysOf(who.userId)).toEqual(keys.filter((key) => key !== doomed)),
        { timeout: 30_000, interval: 250 },
      );
      expect(((await get(who)).body as PhotoBody[]).map((photo) => photo.id)).toEqual([first?.id]);
    });

    it('promotes no other photo to the default; the next saved upload becomes it (A54)', async () => {
      const [who, [first, second]] = await withPhotos(2);

      await remove(who, first?.id ?? '').expect(204);

      const rows = await rowsOf(who.userId);
      expect(rows.map((row) => [row.id, row.isDefault])).toEqual([[second?.id, false]]);
      const next = await post(who, await goodPhoto()).expect(201);
      expect((next.body as PhotoBody).isDefault).toBe(true);
    });

    it('frees a place under the limit of five', async () => {
      const [who, photos] = await withPhotos(5);
      await post(who, await goodPhoto()).expect(409);

      await remove(who, photos[4]?.id ?? '').expect(204);

      await post(who, await goodPhoto()).expect(201);
    });

    it('answers 404 NOT_FOUND for a repeated delete', async () => {
      const [who, [photo]] = await withPhotos(1);
      await remove(who, photo?.id ?? '').expect(204);

      const response = await remove(who, photo?.id ?? '');

      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe('NOT_FOUND');
    });

    it('answers 404 for a one-time photo and keeps it', async () => {
      const [who, [transient]] = await withPhotos(1, 'false');

      const response = await remove(who, transient?.id ?? '');

      expect(response.status).toBe(404);
      expect(await rowsOf(who.userId)).toHaveLength(1);
      expect(await keysOf(who.userId)).toHaveLength(1);
    });

    it('answers 404 for another user’s photo and keeps it with its file', async () => {
      const [owner, [theirs]] = await withPhotos(1);
      const [me] = await withPhotos(1);

      const response = await remove(me, theirs?.id ?? '');

      expect(response.status).toBe(404);
      expect(await rowsOf(owner.userId)).toHaveLength(1);
      expect(await keysOf(owner.userId)).toHaveLength(1);
      expect((await fetch(theirs?.url ?? '')).status).toBe(200);
    });

    it('answers 404 for a random uuid and 400 for an id that is not a uuid', async () => {
      const who = await signIn(testApp.app);

      expect((await remove(who, randomUUID())).status).toBe(404);
      const bad = await remove(who, 'not-a-uuid');
      expect(bad.status).toBe(400);
      expect(errorOf(bad).code).toBe('INVALID_ID');
    });

    it('answers 401 to an anonymous visitor', async () => {
      const response = await remove(null, randomUUID());

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
    });

    it('answers 401 with the session cookies expired when the user row is gone', async () => {
      const [who, [photo]] = await withPhotos(1);
      const cookie = await cookieOfGoneUser(who);

      const response = await http()
        .delete(`/me/photos/${photo?.id ?? ''}`)
        .set({ Cookie: cookie });

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHORIZED');
      await expectSessionCookiesExpired(response);
    });

    it('answers 204 with Temporal unreachable for the start, and keeps the outbox row unstarted', async () => {
      const [who, [photo]] = await withPhotos(1);
      const start = vi
        .spyOn(testApp.app.get(WorkflowStarter), 'start')
        .mockRejectedValueOnce(new Error('Temporal is down'));

      const response = await remove(who, photo?.id ?? '');

      start.mockRestore();
      expect(response.status).toBe(204);
      const [queued] = await testApp.prisma.fileDeletion.findMany({ where: { rowId: photo?.id } });
      expect(queued).toMatchObject({ kind: 'photo', startedAt: null });
      expect(await rowsOf(who.userId)).toEqual([]);
    });
  });
});
