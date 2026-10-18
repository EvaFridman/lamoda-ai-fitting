import { randomUUID } from 'node:crypto';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { signIn } from '../support/sign-in.js';
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
let counter = 0;

beforeAll(async () => {
  testApp = await createTestApp();
  userCookie = { Cookie: (await signIn(testApp.app)).cookie };
});

afterAll(async () => {
  await testApp.close();
});

const http = () => request(testApp.app.getHttpServer());
// The Cookie header of a signed-in user (the test app lets one through the closed routes).
let userCookie: Record<string, string> = {};

async function createUser(): Promise<string> {
  counter += 1;
  const digits = `9${String(counter).padStart(9, '0')}`;
  const user = await testApp.prisma.user.create({
    data: { phone: `+7${digits}`, email: `fs${digits}@mail.ru`, firstName: 'Анна' },
  });
  return user.id;
}

async function post(body: Record<string, unknown>): Promise<request.Response> {
  return http().post('/fitting-sessions').set(userCookie).send(body);
}

async function patch(id: string, body: Record<string, unknown>): Promise<request.Response> {
  return http().patch(`/fitting-sessions/${id}`).set(userCookie).send(body);
}

async function create(
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<SessionBody> {
  const response = await post({ userId, ...overrides });
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
  it('refuses every route without a token with 401 UNAUTHORIZED', async () => {
    const userId = await createUser();
    const session = await create(userId);

    expectError(await http().get('/fitting-sessions'), 401, 'UNAUTHORIZED');
    expectError(await http().get(`/fitting-sessions/${session.id}`), 401, 'UNAUTHORIZED');
    expectError(await http().post('/fitting-sessions').send({ userId }), 401, 'UNAUTHORIZED');
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
  it('creates with 201 and returns the own columns only', async () => {
    const userId = await createUser();
    const response = await post({ userId, title: 'Вечернее платье' });

    expect(response.status).toBe(201);
    const body = response.body as SessionBody;
    expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
    expect(body).toMatchObject({ userId, title: 'Вечернее платье', isActive: true });
    expect(await row(body.id)).toMatchObject({ userId, title: 'Вечернее платье' });
  });

  it('reads one by id with 200', async () => {
    const session = await create(await createUser(), { title: 'A' });
    const response = await http().get(`/fitting-sessions/${session.id}`).set(userCookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(session);
  });

  it('updates the title with 200', async () => {
    const session = await create(await createUser(), { title: 'A' });
    const response = await patch(session.id, { title: 'B' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: session.id, title: 'B', isActive: true });
    expect((await row(session.id)).title).toBe('B');
  });

  it('deletes with 204 and an empty body, then answers 404 NOT_FOUND', async () => {
    const session = await create(await createUser());
    const response = await http().delete(`/fitting-sessions/${session.id}`).set(userCookie);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(
      await http().get(`/fitting-sessions/${session.id}`).set(userCookie),
      404,
      'NOT_FOUND',
    );
  });

  it('answers 404 NOT_FOUND for an unknown id on get, update and delete', async () => {
    const id = randomUUID();

    expectError(await http().get(`/fitting-sessions/${id}`).set(userCookie), 404, 'NOT_FOUND');
    expectError(await patch(id, { title: 'x' }), 404, 'NOT_FOUND');
    expectError(await patch(id, { isActive: true }), 404, 'NOT_FOUND');
    expectError(await http().delete(`/fitting-sessions/${id}`).set(userCookie), 404, 'NOT_FOUND');
  });

  it('answers 404 NOT_FOUND for an empty PATCH of an unknown id', async () => {
    expectError(await patch(randomUUID(), {}), 404, 'NOT_FOUND');
  });

  it('answers 400 INVALID_ID for a malformed id on every id route', async () => {
    expectError(
      await http().get('/fitting-sessions/not-a-uuid').set(userCookie),
      400,
      'INVALID_ID',
    );
    expectError(await patch('not-a-uuid', { title: 'x' }), 400, 'INVALID_ID');
    expectError(
      await http().delete('/fitting-sessions/not-a-uuid').set(userCookie),
      400,
      'INVALID_ID',
    );
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

describe('fitting sessions: one active session per user (E48)', () => {
  it('archives the previous active session when one is created without isActive', async () => {
    const userId = await createUser();
    const first = await create(userId);
    const before = await row(first.id);

    const second = await create(userId);

    expect(second.isActive).toBe(true);
    const archived = await row(first.id);
    expect(archived.isActive).toBe(false);
    expect(archived.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(await activeCount(userId)).toBe(1);
  });

  it('creates an archived session with isActive false and keeps the active one', async () => {
    const userId = await createUser();
    const active = await create(userId);

    const archived = await create(userId, { isActive: false });

    expect(archived.isActive).toBe(false);
    expect((await row(active.id)).isActive).toBe(true);
    expect(await activeCount(userId)).toBe(1);
  });

  it('creates an active session with isActive true and archives the previous one', async () => {
    const userId = await createUser();
    const first = await create(userId);

    await create(userId, { isActive: true });

    expect((await row(first.id)).isActive).toBe(false);
    expect(await activeCount(userId)).toBe(1);
  });

  it('activates an archived session by PATCH and archives the previous, not other users', async () => {
    const userId = await createUser();
    const otherId = await createUser();
    const other = await create(otherId);
    const archived = await create(userId, { isActive: false });
    const active = await create(userId);
    const otherBefore = await row(other.id);

    const response = await patch(archived.id, { isActive: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: archived.id, isActive: true });
    expect((await row(active.id)).isActive).toBe(false);
    expect(await activeCount(userId)).toBe(1);
    expect(await row(other.id)).toEqual(otherBefore);
  });

  it('keeps the active session active on PATCH isActive true and archives nothing', async () => {
    const userId = await createUser();
    const archived = await create(userId, { isActive: false });
    const active = await create(userId);
    const archivedBefore = await row(archived.id);

    const response = await patch(active.id, { isActive: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: active.id, isActive: true });
    expect(await row(archived.id)).toEqual(archivedBefore);
    expect(await activeCount(userId)).toBe(1);
  });

  it('archives the active session by PATCH isActive false, leaving no active one', async () => {
    const userId = await createUser();
    const active = await create(userId);

    const response = await patch(active.id, { isActive: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ isActive: false });
    expect(await activeCount(userId)).toBe(0);
  });

  it('deletes the active session with its generations and activates no other one', async () => {
    const userId = await createUser();
    const archived = await create(userId, { isActive: false });
    const active = await create(userId);
    await testApp.prisma.aiGeneration.create({
      data: {
        sessionId: active.id,
        userImageKey: 'users/photo.jpg',
        status: 'pending',
        aiProvider: 'test',
        aiModel: 'test-model',
      },
    });

    const response = await http().delete(`/fitting-sessions/${active.id}`).set(userCookie);

    expect(response.status).toBe(204);
    expect(await testApp.prisma.aiGeneration.count({ where: { sessionId: active.id } })).toBe(0);
    expect((await row(archived.id)).isActive).toBe(false);
    expect(await activeCount(userId)).toBe(0);
  });

  it('removes the sessions of a deleted user', async () => {
    const userId = await createUser();
    const a = await create(userId);
    const b = await create(userId, { isActive: false });

    await testApp.prisma.user.delete({ where: { id: userId } });

    expect(await testApp.prisma.fittingSession.count({ where: { id: { in: [a.id, b.id] } } })).toBe(
      0,
    );
  });
});

describe('fitting sessions: parallel activations (AC8)', () => {
  it('leaves exactly one active session after parallel POSTs', async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const userId = await createUser();
      if (round % 2 === 0) await create(userId);

      const responses = await Promise.all([post({ userId }), post({ userId }), post({ userId })]);

      expectWonOrConflicted(responses, 201);
      expect(responses.some((response) => response.status === 201)).toBe(true);
      expect(await activeCount(userId)).toBe(1);
    }
  });

  it('leaves exactly one active session after parallel PATCHes of two archived sessions', async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const userId = await createUser();
      const a = await create(userId, { isActive: false });
      const b = await create(userId, { isActive: false });

      const responses = await Promise.all([
        patch(a.id, { isActive: true }),
        patch(b.id, { isActive: true }),
      ]);

      expectWonOrConflicted(responses, 200);
      expect(responses.some((response) => response.status === 200)).toBe(true);
      expect(await activeCount(userId)).toBe(1);
    }
  });

  it('leaves exactly one active session after a POST and a PATCH in parallel', async () => {
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const userId = await createUser();
      const archived = await create(userId, { isActive: false });

      const [created, patched] = await Promise.all([
        post({ userId }),
        patch(archived.id, { isActive: true }),
      ]);

      expectWonOrConflicted([created], 201);
      expectWonOrConflicted([patched], 200);
      expect(created.status === 201 || patched.status === 200).toBe(true);
      expect(await activeCount(userId)).toBe(1);
    }
  });

  it('activates sessions of different users in parallel without conflict', async () => {
    const [one, two] = [await createUser(), await createUser()];

    const responses = await Promise.all([post({ userId: one }), post({ userId: two })]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await activeCount(one)).toBe(1);
    expect(await activeCount(two)).toBe(1);
  });
});

describe('fitting sessions: validation', () => {
  it('refuses a null isActive on create and update with 400 on isActive', async () => {
    const userId = await createUser();
    const session = await create(userId);

    expectError(await post({ userId, isActive: null }), 400, 'VALIDATION_FAILED', 'isActive');
    expectError(await patch(session.id, { isActive: null }), 400, 'VALIDATION_FAILED', 'isActive');
    expect(await row(session.id)).toMatchObject({ isActive: true });
  });

  it('refuses a non-boolean isActive', async () => {
    const userId = await createUser();

    expectError(await post({ userId, isActive: 'true' }), 400, 'VALIDATION_FAILED', 'isActive');
  });

  it('refuses userId in the PATCH body', async () => {
    const session = await create(await createUser());
    const otherId = await createUser();

    expectError(await patch(session.id, { userId: otherId }), 400, 'VALIDATION_FAILED', 'userId');
    expect((await row(session.id)).userId).toBe(session.userId);
  });

  it('refuses a missing or malformed userId on create', async () => {
    expectError(await post({}), 400, 'VALIDATION_FAILED', 'userId');
    expectError(await post({ userId: 'not-a-uuid' }), 400, 'VALIDATION_FAILED', 'userId');
    expectError(await post({ userId: null }), 400, 'VALIDATION_FAILED', 'userId');
  });

  it.each([
    ['outer spaces', ' Платье'],
    ['trailing space', 'Платье '],
    ['empty', ''],
    ['only spaces', '   '],
    ['NUL', 'Пла\u0000тье'],
    ['256 characters', 'a'.repeat(256)],
  ])('refuses a title with %s on create and update', async (_label, title) => {
    const userId = await createUser();
    const session = await create(userId, { title: 'Keep' });

    expectError(await post({ userId, title }), 400, 'VALIDATION_FAILED', 'title');
    expectError(await patch(session.id, { title }), 400, 'VALIDATION_FAILED', 'title');
    expect((await row(session.id)).title).toBe('Keep');
  });

  it('refuses a non-string title', async () => {
    expectError(
      await post({ userId: await createUser(), title: 5 }),
      400,
      'VALIDATION_FAILED',
      'title',
    );
  });

  it('accepts a title of 255 characters', async () => {
    const session = await create(await createUser(), { title: 'a'.repeat(255) });

    expect(session.title).toHaveLength(255);
  });

  it('accepts a null title on create and clears it on update', async () => {
    const userId = await createUser();
    const session = await create(userId, { title: null });
    expect(session.title).toBeNull();

    const named = await create(userId, { title: 'Name', isActive: false });
    const response = await patch(named.id, { title: null });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ title: null });
    expect((await row(named.id)).title).toBeNull();
  });

  it('answers 200 with the record unchanged, updatedAt included, for an empty body', async () => {
    const session = await create(await createUser(), { title: 'A' });
    const response = await patch(session.id, {});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(session);
  });

  it('refuses an unknown field on create and update', async () => {
    const userId = await createUser();
    const session = await create(userId);

    expectError(await post({ userId, extra: 1 }), 400, 'VALIDATION_FAILED', 'extra');
    expectError(await post({ userId, id: randomUUID() }), 400, 'VALIDATION_FAILED', 'id');
    expectError(
      await patch(session.id, { createdAt: '2020-01-01T00:00:00Z' }),
      400,
      'VALIDATION_FAILED',
      'createdAt',
    );
  });

  it.each([{}, { isActive: false }])(
    'answers 400 RELATED_NOT_FOUND on userId for a well-formed id of no user (%j)',
    async (extra) => {
      expectError(
        await post({ userId: randomUUID(), ...extra }),
        400,
        'RELATED_NOT_FOUND',
        'userId',
      );
    },
  );
});

describe('fitting sessions: list', () => {
  it('answers { items, total } and pages with limit and offset', async () => {
    const userId = await createUser();
    const sessions = [];
    for (let i = 0; i < 3; i += 1) sessions.push(await create(userId, { isActive: false }));
    const newestFirst = sessions.map((session) => session.id).reverse();

    const response = await http()
      .get(`/fitting-sessions?userId=${userId}&limit=2&offset=1`)
      .set(userCookie);

    expect(response.status).toBe(200);
    const body = response.body as { items: SessionBody[]; total: number };
    expect(body.total).toBe(3);
    expect(body.items.map((item) => item.id)).toEqual(newestFirst.slice(1, 3));
    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual(RESPONSE_KEYS);
  });

  it('refuses limit 101 with 400 VALIDATION_FAILED', async () => {
    expectError(
      await http().get('/fitting-sessions?limit=101').set(userCookie),
      400,
      'VALIDATION_FAILED',
      'limit',
    );
  });

  it('orders by createdAt desc, then id desc', async () => {
    const userId = await createUser();
    const same = new Date('2031-01-01T00:00:00.000Z');
    const rows = await Promise.all(
      [1, 2, 3].map(() =>
        testApp.prisma.fittingSession.create({
          data: { userId, isActive: false, createdAt: same },
        }),
      ),
    );
    const older = await testApp.prisma.fittingSession.create({
      data: { userId, isActive: false, createdAt: new Date('2030-01-01T00:00:00.000Z') },
    });
    const expected = [
      ...rows.map((session) => session.id).sort((a, b) => (a < b ? 1 : -1)),
      older.id,
    ];

    const body = (await http().get(`/fitting-sessions?userId=${userId}`).set(userCookie)).body as {
      items: SessionBody[];
    };

    expect(body.items.map((item) => item.id)).toEqual(expected);
  });

  it('filters by userId', async () => {
    const userId = await createUser();
    const otherId = await createUser();
    const mine = await create(userId);
    await create(otherId);

    const body = (await http().get(`/fitting-sessions?userId=${userId}`).set(userCookie)).body as {
      items: SessionBody[];
      total: number;
    };

    expect(body.total).toBe(1);
    expect(body.items.map((item) => item.id)).toEqual([mine.id]);
  });

  it('accepts an upper-case userId of an existing user', async () => {
    const userId = await createUser();
    const mine = await create(userId);

    const response = await http()
      .get(`/fitting-sessions?userId=${userId.toUpperCase()}`)
      .set(userCookie);

    expect(response.status).toBe(200);
    expect((response.body as { items: SessionBody[] }).items.map((item) => item.id)).toEqual([
      mine.id,
    ]);
  });

  it('answers an empty list for a well-formed userId of no user', async () => {
    const response = await http().get(`/fitting-sessions?userId=${randomUUID()}`).set(userCookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], total: 0 });
  });

  it('refuses an empty, malformed or repeated userId with 400 VALIDATION_FAILED', async () => {
    const id = randomUUID();

    expectError(
      await http().get('/fitting-sessions?userId=').set(userCookie),
      400,
      'VALIDATION_FAILED',
      'userId',
    );
    expectError(
      await http().get('/fitting-sessions?userId=not-a-uuid').set(userCookie),
      400,
      'VALIDATION_FAILED',
      'userId',
    );
    expectError(
      await http().get(`/fitting-sessions?userId=${id}&userId=${id}`).set(userCookie),
      400,
      'VALIDATION_FAILED',
      'userId',
    );
  });

  it('refuses an unknown query parameter', async () => {
    expectError(
      await http().get('/fitting-sessions?isActive=true').set(userCookie),
      400,
      'VALIDATION_FAILED',
      'isActive',
    );
  });
});
