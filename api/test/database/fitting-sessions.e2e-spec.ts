import { randomUUID } from 'node:crypto';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signIn, type SignedIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

interface SessionBody {
  id: string;
  userId: string;
  title: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const RESPONSE_KEYS = ['createdAt', 'id', 'isActive', 'title', 'updatedAt', 'userId'];
const RACE_ROUNDS = 8;

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());

// A new signed-in user: the routes serve the user of the cookie only (spec 0013 N8).
function createUser(): Promise<SignedIn> {
  return signIn(testApp.app);
}

function get(who: SignedIn, id: string): request.Test {
  return http().get(`/fitting-sessions/${id}`).set({ Cookie: who.cookie });
}

function remove(who: SignedIn, id: string): request.Test {
  return http().delete(`/fitting-sessions/${id}`).set({ Cookie: who.cookie });
}

function list(who: SignedIn, query = ''): request.Test {
  return http().get(`/fitting-sessions${query}`).set({ Cookie: who.cookie });
}

function post(who: SignedIn, body: Record<string, unknown> = {}): request.Test {
  return http().post('/fitting-sessions').set({ Cookie: who.cookie }).send(body);
}

function patch(who: SignedIn, id: string, body: Record<string, unknown>): request.Test {
  return http().patch(`/fitting-sessions/${id}`).set({ Cookie: who.cookie }).send(body);
}

async function create(
  who: SignedIn,
  overrides: Record<string, unknown> = {},
): Promise<SessionBody> {
  const response = await post(who, overrides);
  expect(response.status).toBe(201);
  return response.body as SessionBody;
}

async function row(id: string) {
  return testApp.prisma.fittingSession.findUniqueOrThrow({ where: { id } });
}

function activeCount(userId: string): Promise<number> {
  return testApp.prisma.fittingSession.count({ where: { userId, isActive: true } });
}

function expectError(
  response: request.Response,
  status: number,
  code: string,
  field?: string,
): void {
  expect(response.status).toBe(status);
  const { error } = response.body as {
    error: { code: string; details: { field: string; code: string }[] };
  };
  expect(error.code).toBe(code);
  if (field !== undefined) {
    expect(error.details.map((detail) => detail.field)).toContain(field);
  }
}

// Winners answer 2xx; a loser of the race answers 409 on userId.
function expectWonOrConflicted(responses: request.Response[], okStatus: number): void {
  for (const response of responses) {
    if (response.status === 409) {
      expectError(response, 409, 'ALREADY_EXISTS', 'userId');
    } else {
      expect(response.status).toBe(okStatus);
    }
  }
}

describe('fitting sessions: access', () => {
  it('refuses every route without a session with 401 UNAUTHORIZED', async () => {
    const who = await createUser();
    const session = await create(who);

    expectError(await http().get('/fitting-sessions'), 401, 'UNAUTHORIZED');
    expectError(await http().get(`/fitting-sessions/${session.id}`), 401, 'UNAUTHORIZED');
    expectError(await http().post('/fitting-sessions').send({}), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`/fitting-sessions/${session.id}`).send({ title: 'x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/fitting-sessions/${session.id}`), 401, 'UNAUTHORIZED');
    expect(await row(session.id)).toMatchObject({ title: null, isActive: true });
  });

  it('answers 401 before validation, with no validation details', async () => {
    const responses = [
      await http().post('/fitting-sessions').send({ bad: 1 }),
      await http().patch('/fitting-sessions/not-a-uuid').send({ bad: 1 }),
      await http().get('/fitting-sessions?limit=abc&userId=x'),
      await http().delete(`/fitting-sessions/${randomUUID()}`),
    ];

    for (const response of responses) {
      expectError(response, 401, 'UNAUTHORIZED');
      expect((response.body as { error: { details: unknown[] } }).error.details).toEqual([]);
    }
  });

  it('answers 401 for an Authorization header alone and for an empty session cookie', async () => {
    expectError(
      await http().get('/fitting-sessions').set({ Authorization: 'Bearer x' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(
      await http().get('/fitting-sessions').set({ Cookie: 'lamoda.session_token=' }),
      401,
      'UNAUTHORIZED',
    );
  });

  it('refuses a garbage session cookie with 401 UNAUTHORIZED', async () => {
    expectError(
      await http().get('/fitting-sessions').set({ Cookie: 'lamoda.session_token=garbage' }),
      401,
      'UNAUTHORIZED',
    );
  });
});

describe('fitting sessions: create, read, update, delete (AC2)', () => {
  it('creates for the signed-in user with 201 and returns the own columns only', async () => {
    const who = await createUser();
    const response = await post(who, { title: 'Вечернее платье' });

    expect(response.status).toBe(201);
    const body = response.body as SessionBody;
    expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
    expect(body).toMatchObject({ userId: who.userId, title: 'Вечернее платье', isActive: true });
    expect(await row(body.id)).toMatchObject({ userId: who.userId, title: 'Вечернее платье' });
  });

  it('reads one by id with 200', async () => {
    const who = await createUser();
    const session = await create(who, { title: 'A' });
    const response = await get(who, session.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(session);
  });

  it('updates the title with 200', async () => {
    const who = await createUser();
    const session = await create(who, { title: 'A' });
    const response = await patch(who, session.id, { title: 'B' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: session.id, title: 'B', isActive: true });
    expect((await row(session.id)).title).toBe('B');
  });

  it('deletes with 204 and an empty body, then answers 404 NOT_FOUND', async () => {
    const who = await createUser();
    const session = await create(who);
    const response = await remove(who, session.id);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await get(who, session.id), 404, 'NOT_FOUND');
  });

  it('answers 404 NOT_FOUND for an unknown id on get, update and delete', async () => {
    const who = await createUser();
    const id = randomUUID();

    expectError(await get(who, id), 404, 'NOT_FOUND');
    expectError(await patch(who, id, { title: 'x' }), 404, 'NOT_FOUND');
    expectError(await patch(who, id, { isActive: true }), 404, 'NOT_FOUND');
    expectError(await remove(who, id), 404, 'NOT_FOUND');
  });

  it('answers 404 NOT_FOUND for an empty PATCH of an unknown id', async () => {
    expectError(await patch(await createUser(), randomUUID(), {}), 404, 'NOT_FOUND');
  });

  it('answers 400 INVALID_ID for a malformed id on every id route', async () => {
    const who = await createUser();

    expectError(await get(who, 'not-a-uuid'), 400, 'INVALID_ID');
    expectError(await patch(who, 'not-a-uuid', { title: 'x' }), 400, 'INVALID_ID');
    expectError(await remove(who, 'not-a-uuid'), 400, 'INVALID_ID');
  });

  it('lists the routes in the Swagger document with a uuid id', () => {
    const document = SwaggerModule.createDocument(testApp.app, new DocumentBuilder().build());

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/fitting-sessions', '/fitting-sessions/{id}']),
    );
    const parameters = document.paths['/fitting-sessions/{id}']?.get?.parameters ?? [];
    expect(parameters).toContainEqual(
      expect.objectContaining({
        name: 'id',
        in: 'path',
        schema: expect.objectContaining({ format: 'uuid' }) as unknown,
      }),
    );
  });
});

describe('fitting sessions: own data only (AC8)', () => {
  it('answers 404 NOT_FOUND to another user on get, update and delete and changes nothing', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const session = await create(owner, { title: 'Mine' });
    const stored = await row(session.id);

    expectError(await get(stranger, session.id), 404, 'NOT_FOUND');
    expectError(await patch(stranger, session.id, { title: 'Taken' }), 404, 'NOT_FOUND');
    expectError(await patch(stranger, session.id, {}), 404, 'NOT_FOUND');
    expectError(await remove(stranger, session.id), 404, 'NOT_FOUND');

    expect(await row(session.id)).toEqual(stored);
    expect((await get(owner, session.id)).status).toBe(200);
  });

  it('keeps the generations of a session another user tried to delete', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const session = await create(owner);
    await testApp.prisma.aiGeneration.create({
      data: {
        sessionId: session.id,
        userImageKey: 'users/photo.jpg',
        status: 'pending',
        aiProvider: 'test',
        aiModel: 'test-model',
      },
    });

    expect((await remove(stranger, session.id)).status).toBe(404);

    expect(await testApp.prisma.aiGeneration.count({ where: { sessionId: session.id } })).toBe(1);
  });

  it('archives nothing of either user when PATCH isActive true names another user session', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const archived = await create(owner, { isActive: false });
    const ownerActive = await create(owner);
    const strangerActive = await create(stranger);
    const before = [
      await row(archived.id),
      await row(ownerActive.id),
      await row(strangerActive.id),
    ];

    expectError(await patch(stranger, archived.id, { isActive: true }), 404, 'NOT_FOUND');

    expect([
      await row(archived.id),
      await row(ownerActive.id),
      await row(strangerActive.id),
    ]).toEqual(before);
    expect(await activeCount(owner.userId)).toBe(1);
    expect(await activeCount(stranger.userId)).toBe(1);
  });

  it('creates for the signed-in user only and archives only their active session', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const ownerActive = await create(owner);

    const created = await create(stranger);

    expect(created.userId).toBe(stranger.userId);
    expect((await row(ownerActive.id)).isActive).toBe(true);
  });

  it('lists only the own sessions', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const mine = await create(owner);
    const theirs = await create(stranger);

    const ownList = (await list(owner)).body as { items: SessionBody[]; total: number };
    const theirList = (await list(stranger)).body as { items: SessionBody[]; total: number };

    expect(ownList.items.map((item) => item.id)).toEqual([mine.id]);
    expect(ownList.total).toBe(1);
    expect(theirList.items.map((item) => item.id)).toEqual([theirs.id]);
  });

  it('answers 401 UNAUTHORIZED to a create for a user whose row is gone', async () => {
    const who = await createUser();
    await testApp.prisma.user.delete({ where: { id: who.userId } });

    expectError(await post(who), 401, 'UNAUTHORIZED');
  });
});

describe('fitting sessions: one active session per user (E48)', () => {
  it('archives the previous active session when one is created without isActive', async () => {
    const who = await createUser();
    const first = await create(who);
    const before = await row(first.id);

    const second = await create(who);

    expect(second.isActive).toBe(true);
    const archived = await row(first.id);
    expect(archived.isActive).toBe(false);
    expect(archived.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(await activeCount(who.userId)).toBe(1);
  });

  it('creates an archived session with isActive false and keeps the active one', async () => {
    const who = await createUser();
    const active = await create(who);

    const archived = await create(who, { isActive: false });

    expect(archived.isActive).toBe(false);
    expect((await row(active.id)).isActive).toBe(true);
    expect(await activeCount(who.userId)).toBe(1);
  });

  it('creates an active session with isActive true and archives the previous one', async () => {
    const who = await createUser();
    const first = await create(who);

    await create(who, { isActive: true });

    expect((await row(first.id)).isActive).toBe(false);
    expect(await activeCount(who.userId)).toBe(1);
  });

  it('activates an archived session by PATCH and archives the previous, not other users', async () => {
    const who = await createUser();
    const other = await createUser();
    const otherSession = await create(other);
    const archived = await create(who, { isActive: false });
    const active = await create(who);
    const otherBefore = await row(otherSession.id);

    const response = await patch(who, archived.id, { isActive: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: archived.id, isActive: true });
    expect((await row(active.id)).isActive).toBe(false);
    expect(await activeCount(who.userId)).toBe(1);
    expect(await row(otherSession.id)).toEqual(otherBefore);
  });

  it('keeps the active session active on PATCH isActive true and archives nothing', async () => {
    const who = await createUser();
    const archived = await create(who, { isActive: false });
    const active = await create(who);
    const archivedBefore = await row(archived.id);

    const response = await patch(who, active.id, { isActive: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: active.id, isActive: true });
    expect(await row(archived.id)).toEqual(archivedBefore);
    expect(await activeCount(who.userId)).toBe(1);
  });

  it('archives the active session by PATCH isActive false, leaving no active one', async () => {
    const who = await createUser();
    const active = await create(who);

    const response = await patch(who, active.id, { isActive: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ isActive: false });
    expect(await activeCount(who.userId)).toBe(0);
  });

  it('deletes the active session with its generations and activates no other one', async () => {
    const who = await createUser();
    const archived = await create(who, { isActive: false });
    const active = await create(who);
    await testApp.prisma.aiGeneration.create({
      data: {
        sessionId: active.id,
        userImageKey: 'users/photo.jpg',
        status: 'pending',
        aiProvider: 'test',
        aiModel: 'test-model',
      },
    });

    const response = await remove(who, active.id);

    expect(response.status).toBe(204);
    expect(await testApp.prisma.aiGeneration.count({ where: { sessionId: active.id } })).toBe(0);
    expect((await row(archived.id)).isActive).toBe(false);
    expect(await activeCount(who.userId)).toBe(0);
  });

  it('removes the sessions of a deleted user', async () => {
    const who = await createUser();
    const a = await create(who);
    const b = await create(who, { isActive: false });

    await testApp.prisma.user.delete({ where: { id: who.userId } });

    expect(await testApp.prisma.fittingSession.count({ where: { id: { in: [a.id, b.id] } } })).toBe(
      0,
    );
  });
});

describe('fitting sessions: parallel activations (AC8)', () => {
  it('leaves exactly one active session after parallel POSTs', async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const who = await createUser();
      if (round % 2 === 0) await create(who);

      const responses = await Promise.all([post(who), post(who), post(who)]);

      expectWonOrConflicted(responses, 201);
      expect(responses.some((response) => response.status === 201)).toBe(true);
      expect(await activeCount(who.userId)).toBe(1);
    }
  });

  it('leaves exactly one active session after parallel PATCHes of two archived sessions', async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const who = await createUser();
      const a = await create(who, { isActive: false });
      const b = await create(who, { isActive: false });

      const responses = await Promise.all([
        patch(who, a.id, { isActive: true }),
        patch(who, b.id, { isActive: true }),
      ]);

      expectWonOrConflicted(responses, 200);
      expect(responses.some((response) => response.status === 200)).toBe(true);
      expect(await activeCount(who.userId)).toBe(1);
    }
  });

  it('leaves exactly one active session after a POST and a PATCH in parallel', async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const who = await createUser();
      const archived = await create(who, { isActive: false });

      const [created, patched] = await Promise.all([
        post(who),
        patch(who, archived.id, { isActive: true }),
      ]);

      expectWonOrConflicted([created], 201);
      expectWonOrConflicted([patched], 200);
      expect(created.status === 201 || patched.status === 200).toBe(true);
      expect(await activeCount(who.userId)).toBe(1);
    }
  });

  it('activates sessions of different users in parallel without conflict', async () => {
    const [one, two] = [await createUser(), await createUser()];

    const responses = await Promise.all([post(one), post(two)]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await activeCount(one.userId)).toBe(1);
    expect(await activeCount(two.userId)).toBe(1);
  });
});

describe('fitting sessions: validation', () => {
  it('refuses a null isActive on create and update with 400 on isActive', async () => {
    const who = await createUser();
    const session = await create(who);

    expectError(await post(who, { isActive: null }), 400, 'VALIDATION_FAILED', 'isActive');
    expectError(
      await patch(who, session.id, { isActive: null }),
      400,
      'VALIDATION_FAILED',
      'isActive',
    );
    expect(await row(session.id)).toMatchObject({ isActive: true });
  });

  it('refuses a non-boolean isActive', async () => {
    expectError(
      await post(await createUser(), { isActive: 'true' }),
      400,
      'VALIDATION_FAILED',
      'isActive',
    );
  });

  it('refuses userId in the PATCH body', async () => {
    const who = await createUser();
    const session = await create(who);
    const other = await createUser();

    expectError(
      await patch(who, session.id, { userId: other.userId }),
      400,
      'VALIDATION_FAILED',
      'userId',
    );
    expect((await row(session.id)).userId).toBe(who.userId);
  });

  it('refuses userId in the POST body, also the own one, and creates nothing', async () => {
    const who = await createUser();
    const other = await createUser();

    expectError(await post(who, { userId: who.userId }), 400, 'VALIDATION_FAILED', 'userId');
    expectError(await post(who, { userId: other.userId }), 400, 'VALIDATION_FAILED', 'userId');
    expectError(await post(who, { userId: randomUUID() }), 400, 'VALIDATION_FAILED', 'userId');
    expect(
      await testApp.prisma.fittingSession.count({
        where: { userId: { in: [who.userId, other.userId] } },
      }),
    ).toBe(0);
  });

  it.each([
    ['outer spaces', ' Платье'],
    ['trailing space', 'Платье '],
    ['empty', ''],
    ['only spaces', '   '],
    ['NUL', 'Пла\u0000тье'],
    ['256 characters', 'a'.repeat(256)],
  ])('refuses a title with %s on create and update', async (_label, title) => {
    const who = await createUser();
    const session = await create(who, { title: 'Keep' });

    expectError(await post(who, { title }), 400, 'VALIDATION_FAILED', 'title');
    expectError(await patch(who, session.id, { title }), 400, 'VALIDATION_FAILED', 'title');
    expect((await row(session.id)).title).toBe('Keep');
  });

  it('refuses a non-string title', async () => {
    expectError(await post(await createUser(), { title: 5 }), 400, 'VALIDATION_FAILED', 'title');
  });

  it('accepts a title of 255 characters', async () => {
    const session = await create(await createUser(), { title: 'a'.repeat(255) });

    expect(session.title).toHaveLength(255);
  });

  it('accepts a null title on create and clears it on update', async () => {
    const who = await createUser();
    const session = await create(who, { title: null });
    expect(session.title).toBeNull();

    const named = await create(who, { title: 'Name', isActive: false });
    const response = await patch(who, named.id, { title: null });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ title: null });
    expect((await row(named.id)).title).toBeNull();
  });

  it('answers 200 with the record unchanged, updatedAt included, for an empty body', async () => {
    const who = await createUser();
    const session = await create(who, { title: 'A' });
    const response = await patch(who, session.id, {});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(session);
  });

  it('refuses an unknown field on create and update', async () => {
    const who = await createUser();
    const session = await create(who);

    expectError(await post(who, { extra: 1 }), 400, 'VALIDATION_FAILED', 'extra');
    expectError(await post(who, { id: randomUUID() }), 400, 'VALIDATION_FAILED', 'id');
    expectError(
      await patch(who, session.id, { createdAt: '2020-01-01T00:00:00Z' }),
      400,
      'VALIDATION_FAILED',
      'createdAt',
    );
  });
});

describe('fitting sessions: list', () => {
  it('answers { items, total } and pages with limit and offset', async () => {
    const who = await createUser();
    const sessions = [];
    for (let i = 0; i < 3; i += 1) sessions.push(await create(who, { isActive: false }));
    const newestFirst = sessions.map((session) => session.id).reverse();

    const response = await list(who, '?limit=2&offset=1');

    expect(response.status).toBe(200);
    const body = response.body as { items: SessionBody[]; total: number };
    expect(body.total).toBe(3);
    expect(body.items.map((item) => item.id)).toEqual(newestFirst.slice(1, 3));
    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual(RESPONSE_KEYS);
  });

  it('refuses limit 101 with 400 VALIDATION_FAILED', async () => {
    expectError(await list(await createUser(), '?limit=101'), 400, 'VALIDATION_FAILED', 'limit');
  });

  it('orders by createdAt desc, then id desc', async () => {
    const who = await createUser();
    const same = new Date('2031-01-01T00:00:00.000Z');
    const rows = await Promise.all(
      [1, 2, 3].map(() =>
        testApp.prisma.fittingSession.create({
          data: { userId: who.userId, isActive: false, createdAt: same },
        }),
      ),
    );
    const older = await testApp.prisma.fittingSession.create({
      data: {
        userId: who.userId,
        isActive: false,
        createdAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    const expected = [
      ...rows.map((session) => session.id).sort((a, b) => (a < b ? 1 : -1)),
      older.id,
    ];

    const body = (await list(who)).body as { items: SessionBody[] };

    expect(body.items.map((item) => item.id)).toEqual(expected);
  });

  it('refuses ?userId as an unknown query field, also the own id', async () => {
    const who = await createUser();

    expectError(await list(who, `?userId=${who.userId}`), 400, 'VALIDATION_FAILED', 'userId');
    expectError(await list(who, `?userId=${randomUUID()}`), 400, 'VALIDATION_FAILED', 'userId');
  });

  it('refuses an unknown query parameter', async () => {
    expectError(
      await list(await createUser(), '?isActive=true'),
      400,
      'VALIDATION_FAILED',
      'isActive',
    );
  });
});
