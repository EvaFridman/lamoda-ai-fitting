import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { generationInputKey, generationResultKey, userPhotoKey } from '../../src/storage/keys.js';
import { createS3Client } from '../../src/storage/s3-client.provider.js';
import { StorageService } from '../../src/storage/storage.service.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import { testStorageSettings } from '../support/test-storage.js';

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';
const WEBP = { contentType: 'image/webp' };

interface ErrorBody {
  error: { code: string; details: { field: string; code: string }[] };
}

let testApp: TestApp;
let storage: StorageService;
let shortLived: StorageService;
let counter = 0;
let productId: string;

beforeAll(async () => {
  testApp = await createTestApp();
  storage = testApp.app.get(StorageService);
  const settings = { ...testStorageSettings(), signedUrlTtlSeconds: 1 };
  shortLived = new StorageService(
    settings,
    createS3Client(settings, settings.endpoint),
    createS3Client(settings, settings.publicEndpoint),
  );
  const brand = await testApp.prisma.brand.create({ data: { name: 'Owner check brand' } });
  const category = await testApp.prisma.category.create({
    data: { name: 'Owner check category', slug: 'owner-check-category', isActive: true },
  });
  productId = (
    await testApp.prisma.product.create({
      data: {
        article: 'owner-check-1',
        name: 'Платье',
        price: 100,
        brandId: brand.id,
        categoryId: category.id,
      },
    })
  ).id;
});

afterAll(async () => {
  shortLived.onApplicationShutdown();
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());
const admin = { 'X-Admin-Token': ADMIN_TOKEN };

async function createUser(): Promise<string> {
  counter += 1;
  const digits = `9${String(counter).padStart(9, '0')}`;
  const user = await testApp.prisma.user.create({
    data: { phone: `+7${digits}`, email: `owner${digits}@mail.ru`, firstName: 'Анна' },
  });
  return user.id;
}

async function createSession(userId: string): Promise<string> {
  return (await testApp.prisma.fittingSession.create({ data: { userId } })).id;
}

function generationBody(sessionId: string, extra: Record<string, unknown>) {
  return {
    sessionId,
    productIds: [productId],
    status: 'pending',
    aiProvider: 'openai',
    aiModel: 'gpt-image-1',
    ...extra,
  };
}

async function createGeneration(userId: string): Promise<{ id: string; sessionId: string }> {
  const sessionId = await createSession(userId);
  const response = await http()
    .post('/ai-generations')
    .set(admin)
    .send(generationBody(sessionId, { userImageKey: generationInputKey(userId, randomUUID()) }));
  expect(response.status).toBe(201);
  return { id: (response.body as { id: string }).id, sessionId };
}

function expectOwnerRefusal(response: request.Response, ...fields: string[]): void {
  expect(response.status).toBe(400);
  const { error } = response.body as ErrorBody;
  expect(error.code).toBe('VALIDATION_FAILED');
  for (const field of fields) {
    expect(error.details).toContainEqual(
      expect.objectContaining({ field, code: 'IN_OWNER_FOLDER' }),
    );
  }
}

async function fetchBytes(url: string): Promise<{ status: number; bytes: Buffer }> {
  const response = await fetch(url);
  return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
}

describe('signed links to users files (AC8)', () => {
  it('links a user photo that answers 200 with the file bytes, on get and in the list', async () => {
    const userId = await createUser();
    const key = userPhotoKey(userId);
    const bytes = Buffer.from(`photo-${userId}`);
    await storage.put(key, bytes, { ...WEBP, ownerUserId: userId });
    await testApp.prisma.user.update({
      where: { id: userId },
      data: { fittingProfileImageKey: key },
    });

    const one = (await http().get(`/users/${userId}`).set(admin)).body as {
      fittingProfileImageUrl: string;
    };
    const list = (await http().get('/users?limit=100').set(admin)).body as {
      items: { id: string; fittingProfileImageUrl: string | null }[];
    };

    const fetched = await fetchBytes(one.fittingProfileImageUrl);
    expect(fetched.status).toBe(200);
    expect(fetched.bytes.equals(bytes)).toBe(true);
    const listed = list.items.find((item) => item.id === userId);
    expect(listed?.fittingProfileImageUrl).toBeTruthy();
    expect((await fetchBytes(listed?.fittingProfileImageUrl ?? '')).bytes.equals(bytes)).toBe(true);
  });

  it('answers a null link for a user with no photo key', async () => {
    const userId = await createUser();

    const response = await http().get(`/users/${userId}`).set(admin);

    expect(response.body).toMatchObject({
      fittingProfileImageKey: null,
      fittingProfileImageUrl: null,
    });
  });

  it('links the input and the result of a generation, on get and in the list', async () => {
    const userId = await createUser();
    const sessionId = await createSession(userId);
    const generationId = randomUUID();
    const inputKey = generationInputKey(userId, generationId);
    const resultKey = generationResultKey(userId, generationId);
    const input = Buffer.from(`input-${userId}`);
    const result = Buffer.from(`result-${userId}`);
    await storage.put(inputKey, input, { ...WEBP, ownerUserId: userId });
    await storage.put(resultKey, result, { ...WEBP, ownerUserId: userId });
    const created = await http()
      .post('/ai-generations')
      .set(admin)
      .send(
        generationBody(sessionId, {
          userImageKey: inputKey,
          resultImageKey: resultKey,
          status: 'completed',
        }),
      );
    expect(created.status).toBe(201);
    const { id } = created.body as { id: string };

    const one = (await http().get(`/ai-generations/${id}`).set(admin)).body as {
      userImageUrl: string;
      resultImageUrl: string;
    };
    const list = (await http().get(`/ai-generations?sessionId=${sessionId}`).set(admin)).body as {
      items: { userImageUrl: string; resultImageUrl: string }[];
    };

    for (const links of [one, list.items[0] as typeof one]) {
      const [inputFetched, resultFetched] = await Promise.all([
        fetchBytes(links.userImageUrl),
        fetchBytes(links.resultImageUrl),
      ]);
      expect(inputFetched.status).toBe(200);
      expect(inputFetched.bytes.equals(input)).toBe(true);
      expect(resultFetched.status).toBe(200);
      expect(resultFetched.bytes.equals(result)).toBe(true);
    }
  });

  it('answers a null result link for a generation with no result', async () => {
    const { id } = await createGeneration(await createUser());

    const body = (await http().get(`/ai-generations/${id}`).set(admin)).body as {
      resultImageKey: null;
      resultImageUrl: null;
      userImageUrl: string;
    };

    expect(body.resultImageKey).toBeNull();
    expect(body.resultImageUrl).toBeNull();
    expect(body.userImageUrl).toContain('keep/users/');
  });

  it('refuses a link after its time to live, and serves it before', async () => {
    const userId = await createUser();
    const key = userPhotoKey(userId);
    await storage.put(key, Buffer.from('short'), { ...WEBP, ownerUserId: userId });
    const url = await shortLived.signedUrl(key);

    await vi.waitFor(async () => expect((await fetchBytes(url)).status).toBe(403), {
      timeout: 15_000,
      interval: 250,
    });
    expect((await fetchBytes(await storage.signedUrl(key))).status).toBe(200);
  });
});

// Rows written behind the api, as an older row or the worker could leave them (spec 0011 M25).
describe('links for stored keys outside the owner folder (M25)', () => {
  const foreignKeys: [string, () => string][] = [
    ['another user', () => userPhotoKey(randomUUID())],
    ['media', () => 'media/seed/products/a/1.webp'],
    ['tmp', () => 'tmp/abc/photo.webp'],
    ['a bare key', () => 'users/photo.jpg'],
  ];

  async function legacyGeneration(
    userId: string,
    userImageKey: string,
    resultImageKey: string | null,
  ): Promise<{ id: string; sessionId: string }> {
    const sessionId = await createSession(userId);
    const row = await testApp.prisma.aiGeneration.create({
      data: {
        sessionId,
        userImageKey,
        resultImageKey,
        status: resultImageKey === null ? 'pending' : 'completed',
        aiProvider: 'openai',
        aiModel: 'gpt-image-1',
        products: { createMany: { data: [{ productId }] } },
      },
    });
    return { id: row.id, sessionId };
  }

  it.each(foreignKeys)(
    'answers the user key but a null photo link for %s, on get and in the list',
    async (_label, makeKey) => {
      const userId = await createUser();
      const key = makeKey();
      await testApp.prisma.user.update({
        where: { id: userId },
        data: { fittingProfileImageKey: key },
      });

      const one = await http().get(`/users/${userId}`).set(admin);
      const list = await http().get('/users?limit=100').set(admin);

      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ fittingProfileImageKey: key, fittingProfileImageUrl: null });
      const listed = (list.body as { items: { id: string }[] }).items.find(
        (item) => item.id === userId,
      );
      expect(listed).toMatchObject({ fittingProfileImageKey: key, fittingProfileImageUrl: null });
    },
  );

  it.each(foreignKeys)(
    'answers the keys but null links for %s in both generation keys, on get and in the list',
    async (_label, makeKey) => {
      const userId = await createUser();
      const userKey = makeKey();
      const resultKey = makeKey();
      const { id, sessionId } = await legacyGeneration(userId, userKey, resultKey);

      const one = await http().get(`/ai-generations/${id}`).set(admin);
      const list = await http().get(`/ai-generations?sessionId=${sessionId}`).set(admin);

      const expected = {
        userImageKey: userKey,
        resultImageKey: resultKey,
        userImageUrl: null,
        resultImageUrl: null,
      };
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject(expected);
      expect(one.body).not.toHaveProperty('session');
      const items = (list.body as { items: object[] }).items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject(expected);
      expect(items[0]).not.toHaveProperty('session');
    },
  );

  it('decides each generation link on its own: a foreign result beside an owned input', async () => {
    const userId = await createUser();
    const ownKey = generationInputKey(userId, randomUUID());
    const { id } = await legacyGeneration(userId, ownKey, 'media/seed/products/a/1.webp');

    const body = (await http().get(`/ai-generations/${id}`).set(admin)).body as {
      userImageUrl: string | null;
      resultImageUrl: string | null;
    };

    expect(body.userImageUrl).toContain(ownKey);
    expect(body.resultImageUrl).toBeNull();
  });

  it('decides each generation link on its own: a foreign input beside an owned result', async () => {
    const userId = await createUser();
    const ownKey = generationResultKey(userId, randomUUID());
    const { id } = await legacyGeneration(userId, userPhotoKey(randomUUID()), ownKey);

    const body = (await http().get(`/ai-generations/${id}`).set(admin)).body as {
      userImageUrl: string | null;
      resultImageUrl: string | null;
    };

    expect(body.userImageUrl).toBeNull();
    expect(body.resultImageUrl).toContain(ownKey);
  });

  it('answers a key of the session user in the folder of the session user only', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const strangerKey = generationInputKey(stranger, randomUUID());
    const { id } = await legacyGeneration(owner, strangerKey, null);

    const body = (await http().get(`/ai-generations/${id}`).set(admin)).body;

    expect(body).toMatchObject({ userImageKey: strangerKey, userImageUrl: null });
  });

  it('has no session field in create and update answers either', async () => {
    const userId = await createUser();
    const { id, sessionId } = await createGeneration(userId);

    const created = await http()
      .post('/ai-generations')
      .set(admin)
      .send(generationBody(sessionId, { userImageKey: generationInputKey(userId, randomUUID()) }));
    const updated = await http()
      .patch(`/ai-generations/${id}`)
      .set(admin)
      .send({ aiModel: 'other' });

    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty('session');
    expect(updated.status).toBe(200);
    expect(updated.body).not.toHaveProperty('session');
  });

  it('still links owned keys in the same response as a legacy one in the list', async () => {
    const userId = await createUser();
    const sessionId = await createSession(userId);
    const base = {
      sessionId,
      aiProvider: 'openai',
      aiModel: 'gpt-image-1',
      status: 'pending' as const,
      products: { createMany: { data: [{ productId }] } },
    };
    const ownKey = generationInputKey(userId, randomUUID());
    await testApp.prisma.aiGeneration.create({ data: { ...base, userImageKey: ownKey } });
    await testApp.prisma.aiGeneration.create({
      data: { ...base, userImageKey: 'users/legacy.jpg' },
    });

    const list = (await http().get(`/ai-generations?sessionId=${sessionId}`).set(admin)).body as {
      items: { userImageKey: string; userImageUrl: string | null }[];
    };

    const byKey = new Map(list.items.map((item) => [item.userImageKey, item.userImageUrl]));
    expect(byKey.get('users/legacy.jpg')).toBeNull();
    expect(byKey.get(ownKey)).toContain(ownKey);
  });
});

describe('the owner check of users (AC9)', () => {
  it('refuses any non-null photo key on create and writes no user', async () => {
    const digits = '9999990001';
    const response = await http()
      .post('/users')
      .set(admin)
      .send({
        phone: `+7${digits}`,
        email: `nokey${digits}@mail.ru`,
        firstName: 'Анна',
        fittingProfileImageKey: userPhotoKey(randomUUID()),
      });

    expectOwnerRefusal(response, 'fittingProfileImageKey');
    expect(await testApp.prisma.user.count({ where: { phone: `+7${digits}` } })).toBe(0);
  });

  it('accepts a null photo key on create', async () => {
    const digits = '9999990002';
    const response = await http()
      .post('/users')
      .set(admin)
      .send({
        phone: `+7${digits}`,
        email: `nullkey${digits}@mail.ru`,
        firstName: 'Анна',
        fittingProfileImageKey: null,
      });

    expect(response.status).toBe(201);
  });

  it.each([
    ['another user', () => userPhotoKey(randomUUID())],
    ['media', () => 'media/seed/products/a/1.webp'],
    ['tmp', () => 'tmp/abc/photo.webp'],
    ['a bare key', () => 'users/photo.jpg'],
  ])('refuses %s on update and writes nothing', async (_label, makeKey) => {
    const userId = await createUser();

    const response = await http()
      .patch(`/users/${userId}`)
      .set(admin)
      .send({ fittingProfileImageKey: makeKey() });

    expectOwnerRefusal(response, 'fittingProfileImageKey');
    expect(
      (await testApp.prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .fittingProfileImageKey,
    ).toBeNull();
  });

  it('accepts a key in the owner folder on update and answers its link', async () => {
    const userId = await createUser();
    const key = userPhotoKey(userId);

    const response = await http()
      .patch(`/users/${userId}`)
      .set(admin)
      .send({ fittingProfileImageKey: key });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      fittingProfileImageKey: key,
      fittingProfileImageUrl: expect.stringContaining(key) as unknown,
    });
  });

  it('accepts the owner key when the path id is upper-case', async () => {
    const userId = await createUser();
    const key = userPhotoKey(userId);

    const response = await http()
      .patch(`/users/${userId.toUpperCase()}`)
      .set(admin)
      .send({ fittingProfileImageKey: key });

    expect(response.status).toBe(200);
    expect((response.body as { fittingProfileImageKey: string }).fittingProfileImageKey).toBe(key);
  });

  it('clears the key with null without a check', async () => {
    const userId = await createUser();
    await testApp.prisma.user.update({
      where: { id: userId },
      data: { fittingProfileImageKey: userPhotoKey(userId) },
    });

    const response = await http()
      .patch(`/users/${userId}`)
      .set(admin)
      .send({ fittingProfileImageKey: null });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      fittingProfileImageKey: null,
      fittingProfileImageUrl: null,
    });
  });

  it('answers 404 NOT_FOUND for a missing user with a key', async () => {
    const id = randomUUID();

    const response = await http()
      .patch(`/users/${id}`)
      .set(admin)
      .send({ fittingProfileImageKey: userPhotoKey(id) });

    expect(response.status).toBe(404);
    expect((response.body as ErrorBody).error.code).toBe('NOT_FOUND');
  });
});

describe('the owner check of generations (AC9)', () => {
  it.each([
    ['another user', () => generationInputKey(randomUUID(), randomUUID())],
    ['media', () => 'media/seed/products/a/1.webp'],
    ['tmp', () => 'tmp/abc/photo.webp'],
    ['a bare key', () => 'users/photo.jpg'],
  ])('refuses %s as userImageKey and as resultImageKey on create', async (_label, makeKey) => {
    const userId = await createUser();
    const sessionId = await createSession(userId);

    const asInput = await http()
      .post('/ai-generations')
      .set(admin)
      .send(generationBody(sessionId, { userImageKey: makeKey() }));
    const asResult = await http()
      .post('/ai-generations')
      .set(admin)
      .send(
        generationBody(sessionId, {
          userImageKey: generationInputKey(userId, randomUUID()),
          resultImageKey: makeKey(),
          status: 'completed',
        }),
      );

    expectOwnerRefusal(asInput, 'userImageKey');
    expectOwnerRefusal(asResult, 'resultImageKey');
    expect(await testApp.prisma.aiGeneration.count({ where: { sessionId } })).toBe(0);
  });

  it('accepts keys in the folder of the session user on create', async () => {
    const userId = await createUser();
    const sessionId = await createSession(userId);

    const response = await http()
      .post('/ai-generations')
      .set(admin)
      .send(
        generationBody(sessionId, {
          userImageKey: generationInputKey(userId, randomUUID()),
          resultImageKey: generationResultKey(userId, randomUUID()),
          status: 'completed',
        }),
      );

    expect(response.status).toBe(201);
  });

  it('refuses a key of the folder of another user, though that user exists', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const sessionId = await createSession(owner);

    const response = await http()
      .post('/ai-generations')
      .set(admin)
      .send(
        generationBody(sessionId, { userImageKey: generationInputKey(stranger, randomUUID()) }),
      );

    expectOwnerRefusal(response, 'userImageKey');
  });

  it('answers 400 RELATED_NOT_FOUND on sessionId for a missing session, not an owner error', async () => {
    const response = await http()
      .post('/ai-generations')
      .set(admin)
      .send(
        generationBody(randomUUID(), {
          userImageKey: generationInputKey(randomUUID(), randomUUID()),
        }),
      );

    expect(response.status).toBe(400);
    const { error } = response.body as ErrorBody;
    expect(error.code).toBe('RELATED_NOT_FOUND');
    expect(error.details.map((detail) => detail.field)).toContain('sessionId');
  });

  it('answers the triple error and the owner error together in one 400', async () => {
    const userId = await createUser();
    const sessionId = await createSession(userId);

    const response = await http()
      .post('/ai-generations')
      .set(admin)
      .send(
        generationBody(sessionId, {
          status: 'pending',
          userImageKey: 'users/photo.jpg',
          resultImageKey: generationResultKey(userId, randomUUID()),
        }),
      );

    expect(response.status).toBe(400);
    const { error } = response.body as ErrorBody;
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toContainEqual(
      expect.objectContaining({ field: 'resultImageKey', code: 'MATCHES_STATUS' }),
    );
    expect(error.details).toContainEqual(
      expect.objectContaining({ field: 'userImageKey', code: 'IN_OWNER_FOLDER' }),
    );
  });

  it.each([
    ['another user', () => generationInputKey(randomUUID(), randomUUID())],
    ['media', () => 'media/seed/products/a/1.webp'],
    ['tmp', () => 'tmp/abc/photo.webp'],
    ['a bare key', () => 'users/photo.jpg'],
  ])('refuses %s on update and writes nothing', async (_label, makeKey) => {
    const userId = await createUser();
    const { id } = await createGeneration(userId);
    const stored = await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id } });

    const asInput = await http()
      .patch(`/ai-generations/${id}`)
      .set(admin)
      .send({ userImageKey: makeKey() });
    const asResult = await http()
      .patch(`/ai-generations/${id}`)
      .set(admin)
      .send({ status: 'completed', resultImageKey: makeKey() });

    expectOwnerRefusal(asInput, 'userImageKey');
    expectOwnerRefusal(asResult, 'resultImageKey');
    expect(await testApp.prisma.aiGeneration.findUniqueOrThrow({ where: { id } })).toEqual(stored);
  });

  it('accepts keys in the owner folder on update', async () => {
    const userId = await createUser();
    const { id } = await createGeneration(userId);
    const input = generationInputKey(userId, randomUUID());
    const result = generationResultKey(userId, randomUUID());

    const response = await http()
      .patch(`/ai-generations/${id}`)
      .set(admin)
      .send({ userImageKey: input, resultImageKey: result, status: 'completed' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userImageKey: input, resultImageKey: result });
  });

  it('does not check the stored keys when an update leaves them out', async () => {
    const userId = await createUser();
    const { id } = await createGeneration(userId);
    // Written behind the api, as an older row could be.
    await testApp.prisma.aiGeneration.update({
      where: { id },
      data: { userImageKey: 'users/legacy.jpg' },
    });

    const response = await http()
      .patch(`/ai-generations/${id}`)
      .set(admin)
      .send({ status: 'processing', aiModel: 'other' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userImageKey: 'users/legacy.jpg',
      userImageUrl: null,
      status: 'processing',
    });
  });

  it('answers 404 NOT_FOUND for a missing generation with a key', async () => {
    const response = await http()
      .patch(`/ai-generations/${randomUUID()}`)
      .set(admin)
      .send({ userImageKey: generationInputKey(randomUUID(), randomUUID()) });

    expect(response.status).toBe(404);
  });
});
