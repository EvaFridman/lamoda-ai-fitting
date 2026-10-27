import { randomUUID } from 'node:crypto';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userPhotoKey } from '../../src/storage/keys.js';
import { signIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

interface UserBody {
  id: string;
  phone: string;
  email: string;
  firstName: string;
  lastName: string | null;
  patronymic: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  fittingProfileImageKey: string | null;
  fittingProfileImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const RESPONSE_KEYS = [
  'createdAt',
  'dateOfBirth',
  'email',
  'firstName',
  'fittingProfileImageKey',
  'fittingProfileImageUrl',
  'gender',
  'id',
  'lastName',
  'patronymic',
  'phone',
  'photoConsentVersion',
  'updatedAt',
];

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

// Ten digits of a mobile number (`9XXXXXXXXX`), unique in the file: tests share the table.
function nextDigits(): string {
  counter += 1;
  return `9${String(counter).padStart(9, '0')}`;
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const digits = nextDigits();
  return {
    phone: `+7${digits}`,
    email: `user${digits}@mail.ru`,
    firstName: 'Анна',
    ...overrides,
  };
}

async function create(overrides: Record<string, unknown> = {}): Promise<UserBody> {
  const response = await http().post('/users').set(userCookie).send(validBody(overrides));
  expect(response.status).toBe(201);
  return response.body as UserBody;
}

async function listAll(): Promise<UserBody[]> {
  const items: UserBody[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await http().get(`/users?limit=100&offset=${offset}`).set(userCookie);
    expect(response.status).toBe(200);
    const page = response.body as { items: UserBody[]; total: number };
    items.push(...page.items);
    if (offset + 100 >= page.total) return items;
  }
}

function expectError(
  response: request.Response,
  status: number,
  code: string,
  field?: string,
  detailCode?: string,
): void {
  expect(response.status).toBe(status);
  const { error } = response.body as {
    error: { code: string; details: { field: string; code: string }[] };
  };
  expect(error.code).toBe(code);
  if (field !== undefined) {
    expect(error.details.map((detail) => detail.field)).toContain(field);
  }
  if (field !== undefined && detailCode !== undefined) {
    expect(error.details.filter((detail) => detail.field === field)).toEqual([
      expect.objectContaining({ code: detailCode }),
    ]);
  }
}

function isoDay(offsetYears: number, offsetDays = 0): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + offsetYears);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

describe('users: access (AC1)', () => {
  it('refuses every route without a token with 401 UNAUTHORIZED', async () => {
    const user = await create();
    const id = user.id;

    expectError(await http().get('/users'), 401, 'UNAUTHORIZED');
    expectError(await http().get(`/users/${id}`), 401, 'UNAUTHORIZED');
    expectError(await http().post('/users').send(validBody()), 401, 'UNAUTHORIZED');
    expectError(await http().patch(`/users/${id}`).send({ firstName: 'Ира' }), 401, 'UNAUTHORIZED');
    expectError(await http().delete(`/users/${id}`), 401, 'UNAUTHORIZED');
    expect(await testApp.prisma.user.findUnique({ where: { id } })).toMatchObject({
      firstName: 'Анна',
    });
  });

  it('refuses every route with a wrong token with 401 UNAUTHORIZED', async () => {
    const user = await create();
    const id = user.id;
    const wrong = { Cookie: 'lamoda.session_token=garbage' };

    expectError(await http().get('/users').set(wrong), 401, 'UNAUTHORIZED');
    expectError(await http().get(`/users/${id}`).set(wrong), 401, 'UNAUTHORIZED');
    expectError(await http().post('/users').set(wrong).send(validBody()), 401, 'UNAUTHORIZED');
    expectError(
      await http().patch(`/users/${id}`).set(wrong).send({ firstName: 'Ира' }),
      401,
      'UNAUTHORIZED',
    );
    expectError(await http().delete(`/users/${id}`).set(wrong), 401, 'UNAUTHORIZED');
    expect(await testApp.prisma.user.count({ where: { id } })).toBe(1);
  });

  it('answers 401, not 400, for a malformed id or body without a valid token', async () => {
    expectError(await http().get('/users/not-a-uuid'), 401, 'UNAUTHORIZED');
    expectError(await http().patch('/users/not-a-uuid').send({ phone: 'x' }), 401, 'UNAUTHORIZED');
    expectError(await http().post('/users').send({}), 401, 'UNAUTHORIZED');
  });

  it('serves every route with the right token', async () => {
    const user = await create();

    expect((await http().get('/users').set(userCookie)).status).toBe(200);
    expect((await http().get(`/users/${user.id}`).set(userCookie)).status).toBe(200);
    expect((await http().patch(`/users/${user.id}`).set(userCookie).send({})).status).toBe(200);
    expect((await http().delete(`/users/${user.id}`).set(userCookie)).status).toBe(204);
  });
});

describe('users: create, read, update, delete (AC2)', () => {
  it('creates with 201 and returns the own columns and the photo link, no session ids', async () => {
    const digits = nextDigits();
    const response = await http()
      .post('/users')
      .set(userCookie)
      .send({
        phone: `+7${digits}`,
        email: `full${digits}@mail.ru`,
        firstName: 'Анна',
        lastName: 'Иванова',
        patronymic: 'Сергеевна',
        dateOfBirth: '2000-01-31',
        gender: 'female',
      });

    expect(response.status).toBe(201);
    const body = response.body as UserBody;
    expect(Object.keys(body).sort()).toEqual(RESPONSE_KEYS);
    expect(body).toMatchObject({
      phone: `+7${digits}`,
      email: `full${digits}@mail.ru`,
      firstName: 'Анна',
      lastName: 'Иванова',
      patronymic: 'Сергеевна',
      dateOfBirth: '2000-01-31',
      gender: 'female',
      fittingProfileImageKey: null,
      fittingProfileImageUrl: null,
    });
  });

  it('creates with only the required fields, the others come back null', async () => {
    const user = await create();

    expect(user).toMatchObject({
      lastName: null,
      patronymic: null,
      dateOfBirth: null,
      gender: null,
      fittingProfileImageKey: null,
    });
  });

  it('reads one by id with 200', async () => {
    const user = await create({ dateOfBirth: '1990-05-17' });
    const response = await http().get(`/users/${user.id}`).set(userCookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(user);
  });

  it('updates one field with 200 and keeps the others', async () => {
    const user = await create({ lastName: 'Иванова' });
    const response = await http()
      .patch(`/users/${user.id}`)
      .set(userCookie)
      .send({ firstName: 'Ира' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: user.id,
      firstName: 'Ира',
      lastName: 'Иванова',
      phone: user.phone,
      email: user.email,
    });
    expect(await testApp.prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      firstName: 'Ира',
      lastName: 'Иванова',
    });
  });

  it('normalizes phone and email on update', async () => {
    const user = await create();
    const digits = nextDigits();
    const response = await http()
      .patch(`/users/${user.id}`)
      .set(userCookie)
      .send({
        phone: `8 (${digits.slice(0, 3)}) ${digits.slice(3)}`,
        email: ` New${digits}@Mail.RU `,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      phone: `+7${digits}`,
      email: `new${digits}@mail.ru`,
    });
  });

  it('answers 200 with the record unchanged, updatedAt included, for an empty body', async () => {
    const user = await create();
    const response = await http().patch(`/users/${user.id}`).set(userCookie).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual(user);
  });

  it('clears lastName, patronymic, dateOfBirth, gender and the photo key with null', async () => {
    const user = await create({
      lastName: 'Иванова',
      patronymic: 'Сергеевна',
      dateOfBirth: '2000-01-31',
      gender: 'female',
    });
    const withKey = await http()
      .patch(`/users/${user.id}`)
      .set(userCookie)
      .send({ fittingProfileImageKey: userPhotoKey(user.id) });
    expect(withKey.status).toBe(200);
    const response = await http().patch(`/users/${user.id}`).set(userCookie).send({
      lastName: null,
      patronymic: null,
      dateOfBirth: null,
      gender: null,
      fittingProfileImageKey: null,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      lastName: null,
      patronymic: null,
      dateOfBirth: null,
      gender: null,
      fittingProfileImageKey: null,
      fittingProfileImageUrl: null,
    });
    expect(await testApp.prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      lastName: null,
      patronymic: null,
      dateOfBirth: null,
      gender: null,
      fittingProfileImageKey: null,
    });
  });

  it('accepts null on create for the optional fields', async () => {
    const user = await create({
      lastName: null,
      patronymic: null,
      dateOfBirth: null,
      gender: null,
      fittingProfileImageKey: null,
    });

    expect(user.dateOfBirth).toBeNull();
    expect(user.lastName).toBeNull();
  });

  it('deletes with 204 and an empty body, then answers 404 NOT_FOUND', async () => {
    const user = await create();
    const response = await http().delete(`/users/${user.id}`).set(userCookie);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expectError(await http().get(`/users/${user.id}`).set(userCookie), 404, 'NOT_FOUND');
  });

  it('answers 404 NOT_FOUND for an unknown id on get, update and delete', async () => {
    const id = randomUUID();

    expectError(await http().get(`/users/${id}`).set(userCookie), 404, 'NOT_FOUND');
    expectError(
      await http().patch(`/users/${id}`).set(userCookie).send({ firstName: 'Ира' }),
      404,
      'NOT_FOUND',
    );
    expectError(await http().delete(`/users/${id}`).set(userCookie), 404, 'NOT_FOUND');
  });

  it('answers 400 INVALID_ID for a malformed id on every id route', async () => {
    expectError(await http().get('/users/not-a-uuid').set(userCookie), 400, 'INVALID_ID');
    expectError(
      await http().patch('/users/not-a-uuid').set(userCookie).send({ firstName: 'Ира' }),
      400,
      'INVALID_ID',
    );
    expectError(await http().delete('/users/not-a-uuid').set(userCookie), 400, 'INVALID_ID');
  });

  it('lists /users and /users/{id} in the Swagger document with a uuid id', () => {
    const document = SwaggerModule.createDocument(testApp.app, new DocumentBuilder().build());

    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/users', '/users/{id}']));
    const parameters = document.paths['/users/{id}']?.get?.parameters ?? [];
    expect(parameters).toContainEqual(
      expect.objectContaining({
        name: 'id',
        in: 'path',
        schema: expect.objectContaining({ format: 'uuid' }) as unknown,
      }),
    );
  });
});

describe('users: list (AC3, E47)', () => {
  it('answers { items, total } and pages with limit and offset', async () => {
    await Promise.all([create(), create(), create()]);
    const all = await listAll();
    const response = await http().get('/users?limit=2&offset=1').set(userCookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: all.slice(1, 3), total: all.length });
  });

  it('defaults to 60 items from offset 0', async () => {
    await testApp.prisma.user.createMany({
      data: Array.from({ length: 61 }, () => {
        const digits = nextDigits();
        return { phone: `+7${digits}`, email: `bulk${digits}@mail.ru`, firstName: 'Анна' };
      }),
    });
    const body = (await http().get('/users').set(userCookie)).body as {
      items: UserBody[];
      total: number;
    };

    expect(body.items).toHaveLength(60);
    expect(body.total).toBeGreaterThanOrEqual(61);
  });

  it('refuses limit 101 with 400 VALIDATION_FAILED', async () => {
    expectError(
      await http().get('/users?limit=101').set(userCookie),
      400,
      'VALIDATION_FAILED',
      'limit',
    );
  });

  it('refuses an unknown parameter with 400 VALIDATION_FAILED', async () => {
    expectError(
      await http().get('/users?email=a').set(userCookie),
      400,
      'VALIDATION_FAILED',
      'email',
    );
  });

  it('lists the newest first', async () => {
    const first = await create();
    const second = await create();
    const third = await create();

    const ids = (await listAll()).map((item) => item.id);
    const ours = ids.filter((id) => [first.id, second.id, third.id].includes(id));

    expect(ours).toEqual([third.id, second.id, first.id]);
  });

  it('orders by createdAt desc, then id desc', async () => {
    const same = new Date('2031-01-01T00:00:00.000Z');
    const rows = await Promise.all(
      [1, 2, 3].map(() => {
        const digits = nextDigits();
        return testApp.prisma.user.create({
          data: {
            phone: `+7${digits}`,
            email: `tie${digits}@mail.ru`,
            firstName: 'Анна',
            createdAt: same,
          },
        });
      }),
    );
    const expected = rows.map((row) => row.id).sort((a, b) => (a < b ? 1 : -1));

    const page = (await http().get('/users?limit=3').set(userCookie)).body as { items: UserBody[] };

    expect(page.items.map((item) => item.id)).toEqual(expected);
  });
});

describe('users: cascade (AC6)', () => {
  it('deletes the sessions and generations of a deleted user, not those of others', async () => {
    const user = await create();
    const other = await create();
    const { prisma } = testApp;
    const makeSession = (userId: string, isActive: boolean) =>
      prisma.fittingSession.create({
        data: {
          userId,
          isActive,
          generations: {
            create: {
              userImageKey: 'users/photo.jpg',
              status: 'pending',
              aiProvider: 'test',
              aiModel: 'test-model',
            },
          },
        },
      });
    const [active, archived, others] = await Promise.all([
      makeSession(user.id, true),
      makeSession(user.id, false),
      makeSession(other.id, true),
    ]);

    expect((await http().delete(`/users/${user.id}`).set(userCookie)).status).toBe(204);

    const gone = [active.id, archived.id];
    expect(await prisma.fittingSession.count({ where: { id: { in: gone } } })).toBe(0);
    expect(await prisma.aiGeneration.count({ where: { sessionId: { in: gone } } })).toBe(0);
    expect(await prisma.fittingSession.count({ where: { id: others.id } })).toBe(1);
    expect(await prisma.aiGeneration.count({ where: { sessionId: others.id } })).toBe(1);
  });
});

describe('users: phone and email normalization (AC7)', () => {
  it('stores `8 (999) 123-45-67` as +79991234567 and `Anna@Mail.RU` as anna@mail.ru', async () => {
    const stored = await testApp.prisma.user.findUnique({ where: { phone: '+79991234567' } });
    if (stored !== null) await testApp.prisma.user.delete({ where: { id: stored.id } });
    await testApp.prisma.user.deleteMany({ where: { email: 'anna@mail.ru' } });

    const response = await http()
      .post('/users')
      .set(userCookie)
      .send({ phone: '8 (999) 123-45-67', email: 'Anna@Mail.RU', firstName: 'Анна' });

    expect(response.status).toBe(201);
    const body = response.body as UserBody;
    expect(body).toMatchObject({ phone: '+79991234567', email: 'anna@mail.ru' });
    expect(await testApp.prisma.user.findUnique({ where: { id: body.id } })).toMatchObject({
      phone: '+79991234567',
      email: 'anna@mail.ru',
    });
  });

  it.each([
    [
      '+7 999 123 45 67',
      (d: string) => `+7 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`,
    ],
    [
      '999 123-45-67',
      (d: string) => `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`,
    ],
    ['79991234567', (d: string) => `7${d}`],
    ['89991234567', (d: string) => `8${d}`],
    [
      '+7(999)123-45-67',
      (d: string) => `+7(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`,
    ],
    ['+79991234567', (d: string) => `+7${d}`],
  ])('accepts the phone form %s', async (_label, format) => {
    const digits = nextDigits();
    const response = await http()
      .post('/users')
      .set(userCookie)
      .send(validBody({ phone: format(digits), email: `form${digits}@mail.ru` }));

    expect(response.status).toBe(201);
    expect((response.body as UserBody).phone).toBe(`+7${digits}`);
  });

  it.each([
    '+8 999 123 45 67',
    '+89991234567',
    '8 999 abc 45 67',
    '+7 999 123 45 6a',
    '+7 899 123 45 67',
    '8 899 123 45 67',
    '8 999 123 45 6',
    '+7 999 123 45 678',
    '899912345678',
    '12345',
    '',
    '   ',
  ])('refuses the phone %j with 400 on phone', async (phone) => {
    expectError(
      await http().post('/users').set(userCookie).send(validBody({ phone })),
      400,
      'VALIDATION_FAILED',
      'phone',
    );
  });

  it('refuses a phone that is not a string', async () => {
    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ phone: 79991234567 })),
      400,
      'VALIDATION_FAILED',
      'phone',
    );
  });

  it('trims and lower-cases an email', async () => {
    const digits = nextDigits();
    const user = await create({ email: `  Mixed${digits}@Mail.Ru  ` });

    expect(user.email).toBe(`mixed${digits}@mail.ru`);
  });

  it.each([
    'anna.mail.ru',
    'an na@mail.ru',
    'anna@mail',
    'anna@mail.',
    '@mail.ru',
    'anna@@mail.ru',
    'anna@ma il.ru',
    '',
    '   ',
    `${'a'.repeat(250)}@b.ru`,
  ])('refuses the email %j with 400 on email', async (email) => {
    expectError(
      await http().post('/users').set(userCookie).send(validBody({ email })),
      400,
      'VALIDATION_FAILED',
      'email',
    );
  });

  it.each([0x200b, 0x202e, 0xad, 0xfeff, 0x2060, 0x1b, 0x85])(
    'refuses an email with U+%s with 400 on email',
    async (code) => {
      const email = `anna${String.fromCodePoint(code)}${nextDigits()}@mail.ru`;

      expectError(
        await http().post('/users').set(userCookie).send(validBody({ email })),
        400,
        'VALIDATION_FAILED',
        'email',
      );
    },
  );

  it('stores a decomposed email as NFC and answers 409 for the composed form', async () => {
    const digits = nextDigits();
    const decomposed = `${String.fromCodePoint(0x438, 0x306)}ван${digits}@mail.ru`;
    const composed = `${String.fromCodePoint(0x439)}ван${digits}@mail.ru`;

    const first = await create({ email: decomposed });
    expect(first.email).toBe(composed);
    expect(first.email).toBe(first.email.normalize('NFC'));

    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ email: composed })),
      409,
      'ALREADY_EXISTS',
      'email',
    );
  });

  it('answers 409 for the decomposed form of a stored composed email', async () => {
    const digits = nextDigits();
    await create({ email: `${String.fromCodePoint(0x439)}ван${digits}@mail.ru` });

    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ email: `${String.fromCodePoint(0x438, 0x306)}ван${digits}@mail.ru` })),
      409,
      'ALREADY_EXISTS',
      'email',
    );
  });

  it('accepts an email of 254 characters', async () => {
    const user = await create({ email: `${'a'.repeat(239)}${nextDigits()}@b.ru` });

    expect(user.email).toHaveLength(254);
  });

  it('refuses an email that is not a string', async () => {
    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ email: 5 })),
      400,
      'VALIDATION_FAILED',
      'email',
    );
  });

  it('refuses a bad phone and a bad email on update', async () => {
    const user = await create();

    expectError(
      await http().patch(`/users/${user.id}`).set(userCookie).send({ phone: '+8 999 123 45 67' }),
      400,
      'VALIDATION_FAILED',
      'phone',
    );
    expectError(
      await http().patch(`/users/${user.id}`).set(userCookie).send({ email: 'nope' }),
      400,
      'VALIDATION_FAILED',
      'email',
    );
  });
});

describe('users: date of birth (AC7, E47)', () => {
  // The exact-day bound (14 years today, a day short, 29 February) is in the unit tests of
  // isDateOfBirth: here the clock moves between building the date and the request.
  it('accepts a date well over 14 years ago and returns YYYY-MM-DD', async () => {
    const day = isoDay(-15);
    const user = await create({ dateOfBirth: day });

    expect(user.dateOfBirth).toBe(day);
  });

  it('accepts 1900-01-01', async () => {
    expect((await create({ dateOfBirth: '1900-01-01' })).dateOfBirth).toBe('1900-01-01');
  });

  it.each([
    ['13 years ago', () => isoDay(-13)],
    ['today', () => isoDay(0)],
    ['tomorrow', () => isoDay(0, 1)],
    ['far in the future', () => '2999-01-01'],
    ['before 1900', () => '1899-12-31'],
    ['not a calendar date', () => '2010-02-30'],
    ['with a time', () => '2000-01-01T00:00:00Z'],
    ['in another format', () => '31.01.2000'],
    ['short month', () => '2000-1-1'],
    ['empty', () => ''],
  ])('refuses a date of birth %s on create', async (_label, date) => {
    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ dateOfBirth: date() })),
      400,
      'VALIDATION_FAILED',
      'dateOfBirth',
    );
  });

  it('refuses a number as a date of birth', async () => {
    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ dateOfBirth: 20000101 })),
      400,
      'VALIDATION_FAILED',
      'dateOfBirth',
    );
  });

  it('refuses a date under 14 and a future date on update, and changes nothing', async () => {
    const user = await create({ dateOfBirth: '2000-01-31' });

    for (const dateOfBirth of [isoDay(-13), isoDay(0, 1)]) {
      expectError(
        await http().patch(`/users/${user.id}`).set(userCookie).send({ dateOfBirth }),
        400,
        'VALIDATION_FAILED',
        'dateOfBirth',
      );
    }
    expect((await http().get(`/users/${user.id}`).set(userCookie)).body).toEqual(user);
  });

  it('sets a date of birth on update', async () => {
    const user = await create();
    const response = await http()
      .patch(`/users/${user.id}`)
      .set(userCookie)
      .send({ dateOfBirth: '1985-12-01' });

    expect((response.body as UserBody).dateOfBirth).toBe('1985-12-01');
  });
});

describe('users: required fields and nulls (E47)', () => {
  it.each(['phone', 'email', 'firstName'])('refuses a missing %s on create', async (field) => {
    const body = validBody();
    delete body[field];

    expectError(
      await http().post('/users').set(userCookie).send(body),
      400,
      'VALIDATION_FAILED',
      field,
    );
  });

  it('answers IS_PERSON_NAME for a missing firstName on create', async () => {
    const body = validBody();
    delete body['firstName'];

    expectError(
      await http().post('/users').set(userCookie).send(body),
      400,
      'VALIDATION_FAILED',
      'firstName',
      'IS_PERSON_NAME',
    );
  });

  it('answers IS_PERSON_NAME for a null firstName on create and update', async () => {
    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ firstName: null })),
      400,
      'VALIDATION_FAILED',
      'firstName',
      'IS_PERSON_NAME',
    );
    const user = await create();
    expectError(
      await http().patch(`/users/${user.id}`).set(userCookie).send({ firstName: null }),
      400,
      'VALIDATION_FAILED',
      'firstName',
      'IS_PERSON_NAME',
    );
  });

  it.each(['phone', 'email', 'firstName'])('refuses null in %s on create', async (field) => {
    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ [field]: null })),
      400,
      'VALIDATION_FAILED',
      field,
    );
  });

  it.each(['phone', 'email', 'firstName'])('refuses null in %s on update', async (field) => {
    const user = await create();

    expectError(
      await http()
        .patch(`/users/${user.id}`)
        .set(userCookie)
        .send({ [field]: null }),
      400,
      'VALIDATION_FAILED',
      field,
    );
    expect((await http().get(`/users/${user.id}`).set(userCookie)).body).toEqual(user);
  });

  it('refuses an empty body on create', async () => {
    const response = await http().post('/users').set(userCookie).send({});

    expectError(response, 400, 'VALIDATION_FAILED', 'phone');
    expectError(response, 400, 'VALIDATION_FAILED', 'email');
    expectError(response, 400, 'VALIDATION_FAILED', 'firstName');
  });

  it.each(['id', 'createdAt', 'updatedAt', 'fittingSessions'])(
    'refuses the unknown field %s on create',
    async (field) => {
      expectError(
        await http()
          .post('/users')
          .set(userCookie)
          .send(validBody({ [field]: field === 'id' ? randomUUID() : '2020-01-01T00:00:00Z' })),
        400,
        'VALIDATION_FAILED',
        field,
      );
    },
  );

  it.each(['id', 'createdAt'])('refuses the unknown field %s on update', async (field) => {
    const user = await create();

    expectError(
      await http()
        .patch(`/users/${user.id}`)
        .set(userCookie)
        .send({ [field]: field === 'id' ? randomUUID() : '2020-01-01T00:00:00Z' }),
      400,
      'VALIDATION_FAILED',
      field,
    );
  });

  it('refuses a gender outside the enum', async () => {
    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ gender: 'other' })),
      400,
      'VALIDATION_FAILED',
      'gender',
    );
  });

  it.each(['male', 'female'])('accepts the gender %s', async (gender) => {
    expect((await create({ gender })).gender).toBe(gender);
  });

  it.each(['https://x.ru/a.jpg', '../a.jpg', '/a.jpg', 'a b.jpg', ''])(
    'refuses the photo key %j',
    async (fittingProfileImageKey) => {
      expectError(
        await http().post('/users').set(userCookie).send(validBody({ fittingProfileImageKey })),
        400,
        'VALIDATION_FAILED',
        'fittingProfileImageKey',
      );
    },
  );
});

describe.each(['firstName', 'lastName', 'patronymic'])('users: %s (E47)', (field) => {
  it.each(['Ян', 'Анна-Мария', "О'Нил", 'Anna Maria', 'a'.repeat(50)])(
    'accepts %s',
    async (name) => {
      expect(((await create({ [field]: name })) as unknown as Record<string, string>)[field]).toBe(
        name,
      );
    },
  );

  it.each([' Анна', 'Анна ', 'Анна\n', 'Анна1', '1', 'А', '', ' ', 'Анна--Мария', 'a'.repeat(51)])(
    'refuses %j',
    async (name) => {
      expectError(
        await http()
          .post('/users')
          .set(userCookie)
          .send(validBody({ [field]: name })),
        400,
        'VALIDATION_FAILED',
        field,
        'IS_PERSON_NAME',
      );
    },
  );

  it.each([5, true, ['Анна'], '😀😀'])(
    'refuses the non-name %j with one IS_PERSON_NAME',
    async (name) => {
      expectError(
        await http()
          .post('/users')
          .set(userCookie)
          .send(validBody({ [field]: name })),
        400,
        'VALIDATION_FAILED',
        field,
        'IS_PERSON_NAME',
      );
    },
  );

  it('refuses a bad value on update', async () => {
    const user = await create();

    expectError(
      await http()
        .patch(`/users/${user.id}`)
        .set(userCookie)
        .send({ [field]: ' Анна' }),
      400,
      'VALIDATION_FAILED',
      field,
      'IS_PERSON_NAME',
    );
  });
});

describe('users: duplicates', () => {
  it('refuses a duplicate phone on create with 409 ALREADY_EXISTS on phone', async () => {
    const user = await create();

    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ phone: user.phone })),
      409,
      'ALREADY_EXISTS',
      'phone',
    );
  });

  it('refuses a phone that duplicates only after normalization', async () => {
    const digits = nextDigits();
    await create({ phone: `+7${digits}` });
    const written = `8 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;

    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ phone: written })),
      409,
      'ALREADY_EXISTS',
      'phone',
    );
  });

  it('refuses a duplicate email that differs only by case', async () => {
    const user = await create();

    expectError(
      await http()
        .post('/users')
        .set(userCookie)
        .send(validBody({ email: user.email.toUpperCase() })),
      409,
      'ALREADY_EXISTS',
      'email',
    );
  });

  it('refuses a duplicate phone and email on update', async () => {
    const [one, other] = [await create(), await create()];

    expectError(
      await http().patch(`/users/${other.id}`).set(userCookie).send({ phone: one.phone }),
      409,
      'ALREADY_EXISTS',
      'phone',
    );
    expectError(
      await http()
        .patch(`/users/${other.id}`)
        .set(userCookie)
        .send({ email: ` ${one.email.toUpperCase()}` }),
      409,
      'ALREADY_EXISTS',
      'email',
    );
  });

  it('lets a user keep their own phone and email on update', async () => {
    const user = await create();
    const response = await http()
      .patch(`/users/${user.id}`)
      .set(userCookie)
      .send({ phone: user.phone, email: user.email });

    expect(response.status).toBe(200);
  });
});
