import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestDatabase } from '../support/test-database.js';
import { expectViolation } from '../support/violation.js';

let db: PrismaClient;
let counter = 0;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

function validUser(overrides: Partial<Prisma.UserCreateInput> = {}): Prisma.UserCreateInput {
  counter += 1;
  return {
    phone: `+79${String(counter).padStart(9, '0')}`,
    email: `user${counter}@mail.ru`,
    firstName: 'Иван',
    ...overrides,
  };
}

describe('users: ids and timestamps (AC3)', () => {
  it('gives a UUID v7 and fills created_at and updated_at', async () => {
    const user = await db.user.create({ data: validUser() });

    const rows = await db.$queryRaw<
      { version: number }[]
    >`SELECT uuid_extract_version(id) AS version FROM users WHERE id = ${user.id}::uuid`;
    expect(Number(rows[0]?.version)).toBe(7);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('fills id and both timestamps by itself on a raw INSERT, without the Prisma client', async () => {
    const n = (counter += 1);
    const phone = `+79${String(n).padStart(9, '0')}`;
    const email = `raw${n}@mail.ru`;
    const rows = await db.$queryRaw<
      { version: number; created_at: Date | null; updated_at: Date | null }[]
    >`INSERT INTO users (phone, email, first_name) VALUES (${phone}, ${email}, 'Иван')
      RETURNING uuid_extract_version(id) AS version, created_at, updated_at`;
    expect(Number(rows[0]?.version)).toBe(7);
    expect(rows[0]?.created_at).not.toBeNull();
    expect(rows[0]?.updated_at).not.toBeNull();
  });

  it('moves updated_at when the api updates the row, and keeps created_at', async () => {
    const user = await db.user.create({ data: validUser() });

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 3_600_000);
      const updated = await db.user.update({
        where: { id: user.id },
        data: { lastName: 'Петров' },
      });
      expect(updated.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());
      expect(updated.createdAt.getTime()).toBe(user.createdAt.getTime());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('users: a valid row (AC4)', () => {
  it('accepts a full row and a row with only the required columns', async () => {
    await expect(
      db.user.create({
        data: validUser({
          firstName: 'Анна-Мария',
          lastName: "О'Нил",
          patronymic: 'Ивановна',
          dateOfBirth: new Date('1990-05-17'),
          gender: 'female',
          fittingProfileImageKey: 'users/abc/profile.jpg',
        }),
      }),
    ).resolves.toBeDefined();
    await expect(db.user.create({ data: validUser() })).resolves.toBeDefined();
  });
});

describe('users: phone (users_phone_check)', () => {
  it('accepts +79 and 9 digits', async () => {
    await expect(
      db.user.create({ data: validUser({ phone: '+79991234567' }) }),
    ).resolves.toBeDefined();
  });

  it.each([
    '89991234567',
    '+78991234567',
    '+7999123456',
    '+7999123456a',
    '+79 91234567',
    '9991234567',
  ])('rejects %s', async (phone) => {
    await expectViolation(db.user.create({ data: validUser({ phone }) }), 'users_phone_check');
  });

  it('rejects a phone longer than 12 characters (column type)', async () => {
    await expect(
      db.user.create({ data: validUser({ phone: '+799912345678' }) }),
    ).rejects.toMatchObject({ code: 'P2000' });
  });
});

describe('users: email (users_email_check)', () => {
  it('accepts a lower-case address', async () => {
    await expect(
      db.user.create({ data: validUser({ email: 'ivan.petrov+x@mail.co.uk' }) }),
    ).resolves.toBeDefined();
  });

  it.each([
    'Ivan@Mail.ru',
    'ivan@mail.RU',
    'ivan',
    'ivan@mail',
    'ivan@mail.',
    '@mail.ru',
    'iv an@mail.ru',
    'a@@mail.ru',
    'ivan@ma il.ru',
    'ivan@mail.ru\n',
  ])('rejects %j', async (email) => {
    await expectViolation(db.user.create({ data: validUser({ email }) }), 'users_email_check');
  });

  it('accepts 254 characters and rejects 255 (column type)', async () => {
    const at254 = `${'a'.repeat(249)}@b.ru`;
    const at255 = `${'a'.repeat(250)}@b.ru`;
    expect(at254).toHaveLength(254);
    await expect(db.user.create({ data: validUser({ email: at254 }) })).resolves.toBeDefined();
    await expect(db.user.create({ data: validUser({ email: at255 }) })).rejects.toMatchObject({
      code: 'P2000',
    });
  });
});

describe.each([
  ['firstName', 'users_first_name_check'],
  ['lastName', 'users_last_name_check'],
  ['patronymic', 'users_patronymic_check'],
] as const)('users: %s (%s)', (column, constraint) => {
  it.each([
    'Ян',
    'Иван',
    'Anna',
    'Анна-Мария',
    'Anna Maria',
    "D'Artagnan",
    "Д'Артаньян",
    'Ёлка',
    'a'.repeat(50),
  ])('accepts %s', async (name) => {
    await expect(db.user.create({ data: validUser({ [column]: name }) })).resolves.toBeDefined();
  });

  it.each([
    'А',
    '-Anna',
    'Anna-',
    ' Anna',
    'Anna ',
    "'Anna",
    "Anna'",
    'An--na',
    'Anna  Maria',
    'Anna - Maria',
    'Anna1',
    'Анна_',
    'Anna.',
    'Äna',
    '',
  ])('rejects %j', async (name) => {
    await expectViolation(db.user.create({ data: validUser({ [column]: name }) }), constraint);
  });

  it('rejects 51 characters (column type)', async () => {
    await expect(
      db.user.create({ data: validUser({ [column]: 'a'.repeat(51) }) }),
    ).rejects.toMatchObject({ code: 'P2000' });
  });
});

describe('users: optional names accept NULL', () => {
  it('stores a user without last name and patronymic', async () => {
    const user = await db.user.create({ data: validUser({ lastName: null, patronymic: null }) });
    expect(user.lastName).toBeNull();
    expect(user.patronymic).toBeNull();
  });
});

describe('users: date of birth (users_date_of_birth_check)', () => {
  // One statement with the database's own CURRENT_DATE: the CHECK uses it too, so a UTC
  // midnight between two queries cannot change the outcome.
  function insertWithDayOffset(days: number) {
    const { phone, email } = validUser();
    return db.$executeRaw`INSERT INTO users (phone, email, first_name, date_of_birth)
      VALUES (${phone}, ${email}, 'Иван', CURRENT_DATE + ${days}::int)`;
  }

  it('accepts 1900-01-01', async () => {
    await expect(
      db.user.create({ data: validUser({ dateOfBirth: new Date('1900-01-01') }) }),
    ).resolves.toBeDefined();
  });

  it('rejects 1899-12-31', async () => {
    await expectViolation(
      db.user.create({ data: validUser({ dateOfBirth: new Date('1899-12-31') }) }),
      'users_date_of_birth_check',
    );
  });

  it.each([
    ['yesterday', -1],
    ['today', 0],
  ])('accepts %s', async (_label, days) => {
    await expect(insertWithDayOffset(days)).resolves.toBe(1);
  });

  it('rejects tomorrow', async () => {
    await expectViolation(insertWithDayOffset(1), 'users_date_of_birth_check');
  });

  it('accepts NULL', async () => {
    await expect(db.user.create({ data: validUser({ dateOfBirth: null }) })).resolves.toBeDefined();
  });
});

describe('users: fitting profile image key (users_fitting_profile_image_key_check, C22)', () => {
  it.each(['products/abc-1/main_01.jpg', 'a', 'users/A1/b-c_d.e.png', 'a.b/c'])(
    'accepts %s',
    async (key) => {
      await expect(
        db.user.create({ data: validUser({ fittingProfileImageKey: key }) }),
      ).resolves.toBeDefined();
    },
  );

  it('accepts NULL', async () => {
    await expect(
      db.user.create({ data: validUser({ fittingProfileImageKey: null }) }),
    ).resolves.toBeDefined();
  });

  it.each([
    '/a/b',
    'a/../b',
    'a..b',
    '..',
    'https://x/y',
    '\\host/x',
    ' a',
    'a b',
    '%2e%2e/x',
    'a//b',
    'a/',
    'фото/a.jpg',
    '.hidden',
    'a/.b',
    '-a',
    'a/b\n',
    '',
  ])('rejects %j', async (key) => {
    await expectViolation(
      db.user.create({ data: validUser({ fittingProfileImageKey: key }) }),
      'users_fitting_profile_image_key_check',
    );
  });
});

describe('users: unique keys (AC5)', () => {
  it('rejects a second user with the same phone', async () => {
    const first = await db.user.create({ data: validUser() });
    await expectViolation(
      db.user.create({ data: validUser({ phone: first.phone }) }),
      'users_phone_key',
    );
  });

  it('rejects a second user with the same email', async () => {
    const first = await db.user.create({ data: validUser() });
    await expectViolation(
      db.user.create({ data: validUser({ email: first.email }) }),
      'users_email_key',
    );
  });
});
