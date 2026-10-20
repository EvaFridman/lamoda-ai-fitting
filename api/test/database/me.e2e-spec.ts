import { randomUUID } from 'node:crypto';

import { ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { Client } from '@temporalio/client';
import { makeSignature } from 'better-auth/crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Auth } from '../../src/auth/auth.js';
import { AUTH } from '../../src/auth/auth.module.js';
import { generationFolder, userPhotoKey } from '../../src/storage/keys.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { signIn, type SignedIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
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

interface ApiError {
  error: { code: string };
}

const httpOf = (testApp: TestApp) => request(testApp.app.getHttpServer());

async function cookieNames(testApp: TestApp) {
  const { authCookies } = await testApp.app.get<Auth>(AUTH).$context;
  return {
    token: authCookies.sessionToken.name,
    data: authCookies.sessionData.name,
    dontRemember: authCookies.dontRememberToken.name,
  };
}

// The `name=value` pairs of a response's Set-Cookie headers that set a value.
function setCookies(response: request.Response): Map<string, string> {
  const found = new Map<string, string>();
  for (const header of (response.headers['set-cookie'] as string[] | undefined) ?? []) {
    const [pair = ''] = header.split(';');
    const separator = pair.indexOf('=');
    found.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return found;
}

function setCookieHeaders(response: request.Response): string[] {
  return (response.headers['set-cookie'] as string[] | undefined) ?? [];
}

describe('GET /me, PATCH /me and DELETE /me', () => {
  let testApp: TestApp;
  let names: Awaited<ReturnType<typeof cookieNames>>;

  beforeAll(async () => {
    testApp = await createTestApp({ access: 'production' });
    names = await cookieNames(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  const http = () => httpOf(testApp);
  const as = (who: SignedIn) => ({ Cookie: who.cookie });

  function expectSessionCookiesExpired(response: request.Response) {
    const headers = setCookieHeaders(response);
    for (const name of [names.token, names.data, names.dontRemember]) {
      const header = headers.find((line) => line.startsWith(`${name}=;`));
      expect(header, name).toBeDefined();
      expect(header).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(header).toMatch(/SameSite=Lax/);
    }
  }

  // Both cookies a browser holds after Better Auth's get-session cached the session (N18).
  async function withCachedCopy(who: SignedIn): Promise<{ Cookie: string }> {
    const response = await http().get('/api/auth/get-session').set(as(who));
    expect(response.status).toBe(200);
    const data = setCookies(response).get(names.data);
    expect(data, 'the session_data cookie is set').toBeTruthy();
    return { Cookie: `${who.cookie}; ${names.data}=${data}` };
  }

  describe('without a session (AC7)', () => {
    it('answers 401 UNAUTHORIZED on GET and DELETE', async () => {
      const get = await http().get('/me');
      const remove = await http().delete('/me');

      expect(get.status).toBe(401);
      expect((get.body as ApiError).error.code).toBe('UNAUTHORIZED');
      expect(remove.status).toBe(401);
      expect((remove.body as ApiError).error.code).toBe('UNAUTHORIZED');
    });

    it('sets no cookie in the 401 of the access guard', async () => {
      const get = await http().get('/me');
      const remove = await http().delete('/me');

      expect(setCookieHeaders(get)).toEqual([]);
      expect(setCookieHeaders(remove)).toEqual([]);
    });

    it('answers 401 for a garbage session cookie', async () => {
      const response = await http()
        .get('/me')
        .set({ Cookie: `${names.token}=garbage` });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /me', () => {
    it('answers the signed-in user own data', async () => {
      const who = await signIn(testApp.app, { name: 'Ева' });

      const response = await http().get('/me').set(as(who));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: who.userId,
        firstName: 'Ева',
        phone: null,
        fittingProfileImageKey: null,
        fittingProfileImageUrl: null,
      });
      expect(response.body).not.toHaveProperty('emailVerified');
    });

    it('sets no cookie in a successful answer', async () => {
      const who = await signIn(testApp.app);

      const response = await http().get('/me').set(as(who));

      expect(response.status).toBe(200);
      expect(setCookieHeaders(response)).toEqual([]);
    });

    it('answers each user their own row', async () => {
      const [one, two] = [await signIn(testApp.app), await signIn(testApp.app)];

      const first = await http().get('/me').set(as(one));
      const second = await http().get('/me').set(as(two));

      expect((first.body as { id: string }).id).toBe(one.userId);
      expect((second.body as { id: string }).id).toBe(two.userId);
    });

    it('signs a link for a photo key in the user own folder (0011 M8, M9)', async () => {
      const who = await signIn(testApp.app);
      const key = userPhotoKey(who.userId);
      await testApp.prisma.user.update({
        where: { id: who.userId },
        data: { fittingProfileImageKey: key },
      });

      const response = await http().get('/me').set(as(who));

      const body = response.body as {
        fittingProfileImageKey: string;
        fittingProfileImageUrl: string;
      };
      expect(body.fittingProfileImageKey).toBe(key);
      expect(body.fittingProfileImageUrl).toContain(key);
      expect(body.fittingProfileImageUrl).toContain('X-Amz-Signature');
    });

    it.each([
      ['another user folder', () => userPhotoKey(randomUUID())],
      ['the public media folder', () => `media/${randomUUID()}.webp`],
    ])('answers a null link for a key in %s (0011 M25)', async (_label, makeKey) => {
      const who = await signIn(testApp.app);
      const key = makeKey();
      await testApp.prisma.user.update({
        where: { id: who.userId },
        data: { fittingProfileImageKey: key },
      });

      const response = await http().get('/me').set(as(who));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        fittingProfileImageKey: key,
        fittingProfileImageUrl: null,
      });
    });
  });

  describe('PATCH /me', () => {
    interface Detail {
      field: string;
      code: string;
    }
    interface ValidationBody {
      error: { code: string; details: Detail[] };
    }

    async function stored(userId: string) {
      return testApp.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    }

    async function expectRefused(who: SignedIn, body: object): Promise<Detail[]> {
      const before = await stored(who.userId);

      const response = await http().patch('/me').set(as(who)).send(body);

      expect(response.status).toBe(400);
      expect((response.body as ValidationBody).error.code).toBe('VALIDATION_FAILED');
      expect(await stored(who.userId)).toEqual(before);
      return (response.body as ValidationBody).error.details;
    }

    it('without a session answers 401 UNAUTHORIZED and sets no cookie', async () => {
      const response = await http().patch('/me').send({ firstName: 'Ева' });

      expect(response.status).toBe(401);
      expect((response.body as ApiError).error.code).toBe('UNAUTHORIZED');
      expect(setCookieHeaders(response)).toEqual([]);
    });

    it('answers 401 for a garbage session cookie', async () => {
      const response = await http()
        .patch('/me')
        .set({ Cookie: `${names.token}=garbage` })
        .send({ firstName: 'Ева' });

      expect(response.status).toBe(401);
    });

    it('changes each field and answers the full user, as GET /me does', async () => {
      const who = await signIn(testApp.app);
      await testApp.prisma.user.update({ where: { id: who.userId }, data: { gender: 'female' } });
      const changes = {
        lastName: 'Иванова',
        firstName: 'Мария',
        patronymic: "Сергеевна-О'Нил",
        dateOfBirth: '1990-05-17',
        gender: 'male',
      };

      const response = await http().patch('/me').set(as(who)).send(changes);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: who.userId, ...changes });
      expect(response.body).not.toHaveProperty('emailVerified');
      expect(setCookieHeaders(response)).toEqual([]);
      const read = await http().get('/me').set(as(who));
      expect(read.body).toEqual(response.body);
    });

    it.each([
      ['lastName', 'Петров'],
      ['firstName', 'Пётр'],
      ['patronymic', 'Иванович'],
      ['dateOfBirth', '2001-02-03'],
      ['gender', 'male'],
    ])('changes only %s', async (field, value) => {
      const who = await signIn(testApp.app);
      const before = await stored(who.userId);

      const response = await http()
        .patch('/me')
        .set(as(who))
        .send({ [field]: value });

      expect(response.status).toBe(200);
      expect((response.body as Record<string, unknown>)[field]).toBe(value);
      const after = await stored(who.userId);
      expect(after.email).toBe(before.email);
      expect(after.phone).toBe(before.phone);
      const read = await http().get('/me').set(as(who));
      expect((read.body as Record<string, unknown>)[field]).toBe(value);
    });

    it('changes the gender from female to male', async () => {
      const who = await signIn(testApp.app);
      await testApp.prisma.user.update({ where: { id: who.userId }, data: { gender: 'female' } });

      await http().patch('/me').set(as(who)).send({ gender: 'male' }).expect(200);

      expect((await stored(who.userId)).gender).toBe('male');
    });

    it('clears lastName, firstName, patronymic and dateOfBirth with null', async () => {
      const who = await signIn(testApp.app);
      await testApp.prisma.user.update({
        where: { id: who.userId },
        data: {
          lastName: 'Иванова',
          firstName: 'Анна',
          patronymic: 'Сергеевна',
          dateOfBirth: new Date('1990-05-17T00:00:00Z'),
          gender: 'female',
        },
      });

      const response = await http()
        .patch('/me')
        .set(as(who))
        .send({ lastName: null, firstName: null, patronymic: null, dateOfBirth: null });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        lastName: null,
        firstName: null,
        patronymic: null,
        dateOfBirth: null,
        gender: 'female',
      });
      const row = await stored(who.userId);
      expect(row).toMatchObject({
        lastName: null,
        firstName: null,
        patronymic: null,
        dateOfBirth: null,
      });
    });

    it('refuses gender null and keeps the row', async () => {
      const who = await signIn(testApp.app);
      await testApp.prisma.user.update({ where: { id: who.userId }, data: { gender: 'female' } });

      const details = await expectRefused(who, { gender: null });

      expect(details.map((detail) => detail.field)).toContain('gender');
      expect((await stored(who.userId)).gender).toBe('female');
    });

    it('refuses an unknown gender', async () => {
      const details = await expectRefused(await signIn(testApp.app), { gender: 'other' });

      expect(details.map((detail) => detail.field)).toContain('gender');
    });

    it.each([
      ['Female', 'Female'],
      ['MALE', 'MALE'],
    ])('refuses the gender %s in another case', async (_label, gender) => {
      const details = await expectRefused(await signIn(testApp.app), { gender });

      expect(details.map((detail) => detail.field)).toContain('gender');
    });

    it('ignores query parameters and saves the value of the body', async () => {
      const who = await signIn(testApp.app);
      const before = await stored(who.userId);

      const response = await http()
        .patch('/me?firstName=Query&lastName=Query&gender=male')
        .set(as(who))
        .send({ firstName: 'Мария' });

      expect(response.status).toBe(200);
      const after = await stored(who.userId);
      expect(after.firstName).toBe('Мария');
      expect(after.lastName).toBe(before.lastName);
      expect(after.gender).toBe(before.gender);
    });

    it('saves nothing for query parameters alone', async () => {
      const who = await signIn(testApp.app);
      const before = await stored(who.userId);

      const response = await http().patch('/me?firstName=Query').set(as(who)).send({});

      expect(response.status).toBe(200);
      expect(await stored(who.userId)).toEqual(before);
    });

    it.each([
      ['an array', ['Анна']],
      ['an object', { value: 'Анна' }],
    ])('refuses %s as a name with IS_PERSON_NAME and saves nothing', async (_label, value) => {
      const who = await signIn(testApp.app);
      for (const field of ['lastName', 'firstName', 'patronymic']) {
        const details = await expectRefused(who, { [field]: value });

        expect(details).toContainEqual(expect.objectContaining({ field, code: 'IS_PERSON_NAME' }));
      }
    });

    it.each([
      ['a single letter', 'A'],
      ['digits inside', '1abc'],
      ['51 letters', 'a'.repeat(51)],
      ['a number', 5],
      ['an empty string', ''],
      ['outer spaces', ' Анна'],
      ['a doubled hyphen', 'Анна--Мария'],
    ])('refuses %s as a name with IS_PERSON_NAME and saves nothing', async (_label, value) => {
      const who = await signIn(testApp.app);
      for (const field of ['lastName', 'firstName', 'patronymic']) {
        const details = await expectRefused(who, { [field]: value });

        expect(details).toContainEqual(expect.objectContaining({ field, code: 'IS_PERSON_NAME' }));
      }
    });

    it.each([
      ['a future date', '2999-01-01'],
      ['before 1900-01-01', '1899-12-31'],
      ['younger than 14', `${new Date().getUTCFullYear() - 10}-06-15`],
      ['a day that does not exist', '2000-02-30'],
      ['a wrong format', '17.05.1990'],
      ['a timestamp', '1990-05-17T00:00:00Z'],
      ['a number', 19900517],
    ])('refuses %s as a date of birth with IS_DATE_OF_BIRTH', async (_label, value) => {
      const details = await expectRefused(await signIn(testApp.app), { dateOfBirth: value });

      expect(details).toContainEqual(
        expect.objectContaining({ field: 'dateOfBirth', code: 'IS_DATE_OF_BIRTH' }),
      );
    });

    it('refuses a bad value together with a good one and saves neither', async () => {
      const who = await signIn(testApp.app);

      const details = await expectRefused(who, { firstName: 'Мария', lastName: '1' });

      expect(details.map((detail) => detail.field)).toEqual(['lastName']);
    });

    it.each([
      ['email', 'other@example.com'],
      ['phone', '+79991234567'],
      ['fittingProfileImageKey', 'keep/users/x/photo.webp'],
      ['id', randomUUID()],
      ['emailVerified', false],
      ['createdAt', '2000-01-01T00:00:00Z'],
      ['updatedAt', '2000-01-01T00:00:00Z'],
      ['name', 'Другое'],
    ])('refuses the field %s by name and saves nothing', async (field, value) => {
      const who = await signIn(testApp.app);

      const details = await expectRefused(who, { firstName: 'Мария', [field]: value });

      expect(details.map((detail) => detail.field)).toContain(field);
    });

    it('answers 200 for an empty body and changes nothing, updatedAt included', async () => {
      const who = await signIn(testApp.app);
      const before = await stored(who.userId);

      const response = await http().patch('/me').set(as(who)).send({});

      expect(response.status).toBe(200);
      expect((response.body as { id: string }).id).toBe(who.userId);
      expect(setCookieHeaders(response)).toEqual([]);
      expect(await stored(who.userId)).toEqual(before);
    });

    it('never changes another user row', async () => {
      const [one, two] = [await signIn(testApp.app), await signIn(testApp.app)];
      const beforeTwo = await stored(two.userId);

      await http()
        .patch('/me')
        .set(as(one))
        .send({ firstName: 'Мария', lastName: 'Петрова', gender: 'male' })
        .expect(200);
      await http()
        .patch('/me')
        .set(as(one))
        .send({ id: two.userId, firstName: 'Чужая' })
        .expect(400);

      expect(await stored(two.userId)).toEqual(beforeTwo);
      expect((await stored(one.userId)).firstName).toBe('Мария');
    });
  });

  describe('DELETE /me', () => {
    async function arrange() {
      const who = await signIn(testApp.app);
      const bystander = await signIn(testApp.app);
      const session = await testApp.prisma.fittingSession.create({
        data: { userId: who.userId },
      });
      const generation = await testApp.prisma.aiGeneration.create({
        data: {
          sessionId: session.id,
          userImageKey: 'users/photo.jpg',
          status: 'pending',
          aiProvider: 'test',
          aiModel: 'test-model',
        },
      });
      const bystanderSession = await testApp.prisma.fittingSession.create({
        data: { userId: bystander.userId },
      });
      return { who, bystander, session, generation, bystanderSession };
    }

    it('answers 204 and removes the user with every row that depends on them', async () => {
      const { who, bystander, session, generation, bystanderSession } = await arrange();
      const { prisma } = testApp;
      expect(await prisma.account.count({ where: { userId: who.userId } })).toBe(0);
      await prisma.account.create({
        data: {
          userId: who.userId,
          accountId: randomUUID(),
          providerId: 'google',
        },
      });

      const response = await http().delete('/me').set(as(who));

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(await prisma.user.count({ where: { id: who.userId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: who.userId } })).toBe(0);
      expect(await prisma.account.count({ where: { userId: who.userId } })).toBe(0);
      expect(await prisma.fittingSession.count({ where: { id: session.id } })).toBe(0);
      expect(await prisma.aiGeneration.count({ where: { id: generation.id } })).toBe(0);
      expect(await prisma.user.count({ where: { id: bystander.userId } })).toBe(1);
      expect(await prisma.fittingSession.count({ where: { id: bystanderSession.id } })).toBe(1);
    });

    it('expires the session token, its cached copy and the remember flag in the answer', async () => {
      const { who } = await arrange();

      const cookies = await withCachedCopy(who);

      const response = await http().delete('/me').set(cookies);

      expect(response.status).toBe(204);
      expectSessionCookiesExpired(response);
    });

    it('leaves the session token alone answering 401 on GET /me', async () => {
      const { who } = await arrange();
      await http().delete('/me').set(as(who)).expect(204);

      const response = await http().get('/me').set(as(who));

      expect(response.status).toBe(401);
      expect((response.body as ApiError).error.code).toBe('UNAUTHORIZED');
    });

    it('answers 401 to another session of the deleted user', async () => {
      const { who } = await arrange();
      const context = await testApp.app.get<Auth>(AUTH).$context;
      const other = await context.internalAdapter.createSession(who.userId);
      const signed = `${other.token}.${await makeSignature(other.token, context.secret)}`;
      const otherCookie = { Cookie: `${names.token}=${encodeURIComponent(signed)}` };
      expect((await http().get('/me').set(otherCookie)).status).toBe(200);

      await http().delete('/me').set(as(who)).expect(204);

      const get = await http().get('/me').set(otherCookie);
      expect(get.status).toBe(401);
      // The session row went with the user, so this 401 comes from the access guard, not MeService.
      expect(setCookieHeaders(get)).toEqual([]);
      const remove = await http().delete('/me').set(otherCookie);
      expect(remove.status).toBe(401);
      expect(setCookieHeaders(remove)).toEqual([]);
    });
  });

  describe('a deleted user with a cached session copy (N31)', () => {
    async function deletedWithCopy() {
      const who = await signIn(testApp.app);
      const copy = await withCachedCopy(who);
      await http().delete('/me').set(as(who)).expect(204);
      // The copy still passes for the user (a signed-in-only route lets it in); the row is gone.
      expect((await http().get('/fitting-sessions').set(copy)).status).toBe(200);
      return { who, copy };
    }

    it('answers 401 UNAUTHORIZED on GET /me', async () => {
      const { copy } = await deletedWithCopy();

      const response = await http().get('/me').set(copy);

      expect(response.status).toBe(401);
      expect((response.body as ApiError).error.code).toBe('UNAUTHORIZED');
      expectSessionCookiesExpired(response);
    });

    it('answers 401 UNAUTHORIZED on DELETE /me', async () => {
      const { copy } = await deletedWithCopy();

      const response = await http().delete('/me').set(copy);

      expect(response.status).toBe(401);
      expect((response.body as ApiError).error.code).toBe('UNAUTHORIZED');
      expectSessionCookiesExpired(response);
    });

    it.each([
      ['a body', { firstName: 'Мария' }],
      ['an empty body', {}],
    ])('answers 401 UNAUTHORIZED on PATCH /me with %s', async (_label, body) => {
      const { who, copy } = await deletedWithCopy();

      const response = await http().patch('/me').set(copy).send(body);

      expect(response.status).toBe(401);
      expect((response.body as ApiError).error.code).toBe('UNAUTHORIZED');
      expectSessionCookiesExpired(response);
      expect(await testApp.prisma.user.count({ where: { id: who.userId } })).toBe(0);
    });

    it('answers 401 UNAUTHORIZED on POST /fitting-sessions and creates no row', async () => {
      const { who, copy } = await deletedWithCopy();

      const response = await http().post('/fitting-sessions').set(copy).send({});

      expect(response.status).toBe(401);
      expect((response.body as ApiError).error.code).toBe('UNAUTHORIZED');
      expect(await testApp.prisma.fittingSession.count({ where: { userId: who.userId } })).toBe(0);
    });

    it('reads nothing on the lists and 404s on a fitting session id', async () => {
      const { copy } = await deletedWithCopy();

      const sessions = await http().get('/fitting-sessions').set(copy);
      const generations = await http().get('/ai-generations').set(copy);
      const one = await http().get(`/fitting-sessions/${randomUUID()}`).set(copy);

      expect(sessions.body).toEqual({ items: [], total: 0 });
      expect(generations.body).toEqual({ items: [], total: 0 });
      expect(one.status).toBe(404);
    });
  });
});

describe('DELETE /me starts the file deletion (AC12)', () => {
  const settings = testTemporalSettings();
  const BODY = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
  const { bucket } = testStorageSettings();
  let workerStorage: StorageService;
  let worker: TestWorker;
  let testApp: TestApp;
  let s3: S3Client;

  beforeAll(async () => {
    s3 = createTestS3Client();
    workerStorage = createTestStorageService();
    testApp = await createTestApp({ temporal: settings });
    worker = await startTestWorker(settings, workerStorage, testApp.prisma);
  }, 120_000);

  afterAll(async () => {
    await worker.stop();
    await testApp.close();
    workerStorage.onApplicationShutdown();
    s3.destroy();
  });

  async function keysUnder(prefix: string): Promise<string[]> {
    const found = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    return (found.Contents ?? []).map((object) => object.Key ?? '');
  }

  it('empties the folder of the user and keeps another user files', async () => {
    const who = await signIn(testApp.app);
    const other = await signIn(testApp.app);
    const generationId = randomUUID();
    const keys = [
      userPhotoKey(who.userId),
      `${generationFolder(who.userId, generationId)}input.webp`,
      `${generationFolder(who.userId, generationId)}result.webp`,
    ];
    const otherKey = userPhotoKey(other.userId);
    for (const Key of [...keys, otherKey]) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body: BODY }));
    }
    expect(await keysUnder(`keep/users/${who.userId}/`)).toHaveLength(3);

    await httpOf(testApp).delete('/me').set({ Cookie: who.cookie }).expect(204);

    await vi.waitFor(async () => expect(await keysUnder(`keep/users/${who.userId}/`)).toEqual([]), {
      timeout: 30_000,
      interval: 250,
    });
    // An empty folder does not show that the workflow succeeded: it must complete, not fail.
    await testApp.app.get(Client).workflow.getHandle(`delete-files-user-${who.userId}`).result();
    expect(await keysUnder(`keep/users/${other.userId}/`)).toEqual([otherKey]);
  }, 60_000);
});
