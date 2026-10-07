import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const next = (): number => ++counter;

function newUser() {
  const n = next();
  return db.user.create({
    data: {
      phone: `+79${String(n).padStart(9, '0')}`,
      email: `user${n}@mail.ru`,
      firstName: 'Иван',
    },
  });
}

function newSession(userId: string, isActive = true) {
  return db.fittingSession.create({ data: { userId, isActive } });
}

// A user with a session: most generation tests need only the session id.
async function newActiveSession() {
  const user = await newUser();
  return newSession(user.id);
}

async function newProduct() {
  const n = next();
  const [brand, category] = await Promise.all([
    db.brand.create({ data: { name: `Brand ${n}` } }),
    db.category.create({ data: { name: `Category ${n}`, slug: `category-${n}`, isActive: true } }),
  ]);
  return db.product.create({
    data: {
      article: `ART-${n}`,
      name: `Product ${n}`,
      price: '1990.00',
      brandId: brand.id,
      categoryId: category.id,
    },
  });
}

async function newGeneration(overrides: Partial<Prisma.AiGenerationUncheckedCreateInput> = {}) {
  const sessionId = overrides.sessionId ?? (await newActiveSession()).id;
  return db.aiGeneration.create({
    data: {
      userImageKey: 'users/abc/photo.jpg',
      status: 'pending',
      aiProvider: 'test-provider',
      aiModel: 'test-model',
      ...overrides,
      sessionId,
    },
  });
}

async function uuidVersion(table: string, id: string): Promise<number> {
  // The table name is one of our constants below, never user input.
  const rows = await db.$queryRawUnsafe<{ version: number }[]>(
    `SELECT uuid_extract_version(id) AS version FROM ${table} WHERE id = $1::uuid`,
    id,
  );
  return Number(rows[0]?.version);
}

describe('fittings: ids and timestamps (AC3)', () => {
  it('fitting_sessions: a UUID v7 and both timestamps', async () => {
    const session = await newActiveSession();
    expect(await uuidVersion('fitting_sessions', session.id)).toBe(7);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.updatedAt).toBeInstanceOf(Date);
  });

  it('fitting_sessions: the database fills id, is_active and timestamps on a raw INSERT', async () => {
    const user = await newUser();
    const rows = await db.$queryRaw<
      { version: number; is_active: boolean; created_at: Date | null; updated_at: Date | null }[]
    >`INSERT INTO fitting_sessions (user_id) VALUES (${user.id}::uuid)
      RETURNING uuid_extract_version(id) AS version, is_active, created_at, updated_at`;
    expect(Number(rows[0]?.version)).toBe(7);
    expect(rows[0]?.is_active).toBe(true);
    expect(rows[0]?.created_at).not.toBeNull();
    expect(rows[0]?.updated_at).not.toBeNull();
  });

  it('ai_generations: a UUID v7 and both timestamps', async () => {
    const generation = await newGeneration();
    expect(await uuidVersion('ai_generations', generation.id)).toBe(7);
    expect(generation.createdAt).toBeInstanceOf(Date);
    expect(generation.updatedAt).toBeInstanceOf(Date);
  });

  it('generation_products: a link has no id and no timestamps', async () => {
    const generation = await newGeneration();
    const product = await newProduct();
    const link = await db.generationProduct.create({
      data: { generationId: generation.id, productId: product.id },
    });
    expect(Object.keys(link).sort()).toEqual(['generationId', 'productId']);
  });
});

describe('ai generations: status rule (AC4, ai_generations_status_check)', () => {
  const RESULT = 'results/abc/out.png';

  it.each([
    ['pending', null, null],
    ['processing', null, null],
    ['completed', RESULT, null],
    ['failed', null, 'provider timeout'],
  ] as const)(
    'accepts %s with result %j and error %j',
    async (status, resultImageKey, errorMessage) => {
      await expect(newGeneration({ status, resultImageKey, errorMessage })).resolves.toBeDefined();
    },
  );

  it.each([
    ['completed', null, null],
    ['completed', RESULT, 'oops'],
    ['completed', null, 'oops'],
    ['failed', null, null],
    ['failed', RESULT, null],
    ['pending', RESULT, null],
    ['pending', null, 'oops'],
    ['processing', RESULT, null],
    ['processing', null, 'oops'],
    ['processing', RESULT, 'oops'],
  ] as const)(
    'rejects %s with result %j and error %j',
    async (status, resultImageKey, errorMessage) => {
      await expectViolation(
        newGeneration({ status, resultImageKey, errorMessage }),
        'ai_generations_status_check',
      );
    },
  );
});

describe('ai generations: error message (ai_generations_error_message_check, C23)', () => {
  it('accepts 1 and 1000 characters', async () => {
    await expect(newGeneration({ status: 'failed', errorMessage: 'x' })).resolves.toBeDefined();
    await expect(
      newGeneration({ status: 'failed', errorMessage: 'x'.repeat(1000) }),
    ).resolves.toBeDefined();
  });

  it('rejects an empty message', async () => {
    await expectViolation(
      newGeneration({ status: 'failed', errorMessage: '' }),
      'ai_generations_error_message_check',
    );
  });

  it('rejects 1001 characters (column type, no constraint name)', async () => {
    await expect(
      newGeneration({ status: 'failed', errorMessage: 'x'.repeat(1001) }),
    ).rejects.toMatchObject({ code: 'P2000' });
  });
});

const VALID_KEYS = ['products/abc-1/main_01.jpg', 'a', 'A1/b-c_d.e.png', 'a.b/c'];
const INVALID_KEYS = [
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
];

describe('ai generations: user image key (ai_generations_user_image_key_check, C22)', () => {
  it.each(VALID_KEYS)('accepts %s', async (userImageKey) => {
    await expect(newGeneration({ userImageKey })).resolves.toBeDefined();
  });

  it.each(INVALID_KEYS)('rejects %j', async (userImageKey) => {
    await expectViolation(newGeneration({ userImageKey }), 'ai_generations_user_image_key_check');
  });
});

describe('ai generations: result image key (ai_generations_result_image_key_check, C22)', () => {
  it.each(VALID_KEYS)('accepts %s', async (resultImageKey) => {
    await expect(newGeneration({ status: 'completed', resultImageKey })).resolves.toBeDefined();
  });

  it.each(INVALID_KEYS)('rejects %j', async (resultImageKey) => {
    await expectViolation(
      newGeneration({ status: 'completed', resultImageKey }),
      'ai_generations_result_image_key_check',
    );
  });
});

describe('references', () => {
  it('rejects a session of an unknown user', async () => {
    await expectViolation(newSession(randomUUID()), 'fitting_sessions_user_id_fkey');
  });

  it('rejects a generation of an unknown session', async () => {
    await expectViolation(
      newGeneration({ sessionId: randomUUID() }),
      'ai_generations_session_id_fkey',
    );
  });

  it('rejects the same product twice in one generation', async () => {
    const generation = await newGeneration();
    const product = await newProduct();
    const data = { generationId: generation.id, productId: product.id };
    await db.generationProduct.create({ data });
    await expectViolation(db.generationProduct.create({ data }), 'generation_products_pkey');
  });
});

describe('one active fitting session per user (AC5, C15, C21)', () => {
  it('accepts two archived sessions and one active', async () => {
    const user = await newUser();
    await newSession(user.id, false);
    await newSession(user.id, false);
    const active = await newSession(user.id, true);

    const found = await db.fittingSession.findUnique({
      where: { userId: user.id, isActive: true },
    });
    expect(found?.id).toBe(active.id);

    const archived = await db.fittingSession.findFirst({
      where: { userId: user.id, isActive: false },
    });
    expect(archived).not.toBeNull();
    expect(archived?.id).not.toBe(active.id);
  });

  it('rejects a second active session', async () => {
    const user = await newUser();
    await newSession(user.id);
    await expectViolation(newSession(user.id), 'fitting_sessions_user_id_key');
  });

  it('rejects activating an archived session while another is active', async () => {
    const user = await newUser();
    await newSession(user.id);
    const archived = await newSession(user.id, false);
    await expectViolation(
      db.fittingSession.update({ where: { id: archived.id }, data: { isActive: true } }),
      'fitting_sessions_user_id_key',
    );
  });

  it('allows a new active session after the active one is archived', async () => {
    const user = await newUser();
    const first = await newSession(user.id);
    await db.fittingSession.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    });
    const second = await newSession(user.id);

    expect(second.id).not.toBe(first.id);
    expect(await db.fittingSession.count({ where: { userId: user.id } })).toBe(2);
    expect(await db.fittingSession.count({ where: { userId: user.id, isActive: true } })).toBe(1);
  });

  it('keeps the active session of one user independent of another user', async () => {
    const [a, b] = await Promise.all([newUser(), newUser()]);
    await newSession(a.id);
    await expect(newSession(b.id)).resolves.toBeDefined();
  });

  // C21: the client treats userId as fully unique, but the key covers active sessions only.
  it('findUnique by userId alone returns an archived session; with isActive it does not', async () => {
    const user = await newUser();
    const archived = await newSession(user.id, false);

    const loose = await db.fittingSession.findUnique({ where: { userId: user.id } });
    expect(loose?.id).toBe(archived.id);
    expect(loose?.isActive).toBe(false);

    const strict = await db.fittingSession.findUnique({
      where: { userId: user.id, isActive: true },
    });
    expect(strict).toBeNull();
  });
});

describe('deletes (AC6, C8)', () => {
  async function userWithGeneration() {
    const user = await newUser();
    const session = await newSession(user.id);
    const generation = await newGeneration({ sessionId: session.id });
    const product = await newProduct();
    await db.generationProduct.create({
      data: { generationId: generation.id, productId: product.id },
    });
    return { user, session, generation, product };
  }

  it('deleting a user removes sessions, generations and their product links', async () => {
    const { user, session, generation, product } = await userWithGeneration();
    await newSession(user.id, false);

    await db.user.delete({ where: { id: user.id } });

    expect(await db.fittingSession.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.aiGeneration.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await db.generationProduct.count({ where: { generationId: generation.id } })).toBe(0);
    expect(await db.product.count({ where: { id: product.id } })).toBe(1);
  });

  it('deleting a session removes its generations and their product links, keeps the user', async () => {
    const { user, session, generation } = await userWithGeneration();

    await db.fittingSession.delete({ where: { id: session.id } });

    expect(await db.aiGeneration.count({ where: { id: generation.id } })).toBe(0);
    expect(await db.generationProduct.count({ where: { generationId: generation.id } })).toBe(0);
    expect(await db.user.count({ where: { id: user.id } })).toBe(1);
  });

  it('deleting a generation removes its product links, keeps the product', async () => {
    const { generation, product } = await userWithGeneration();

    await db.aiGeneration.delete({ where: { id: generation.id } });

    expect(await db.generationProduct.count({ where: { generationId: generation.id } })).toBe(0);
    expect(await db.product.count({ where: { id: product.id } })).toBe(1);
  });

  it('refuses to delete a product used in a generation', async () => {
    const { product } = await userWithGeneration();
    await expectViolation(
      db.product.delete({ where: { id: product.id } }),
      'generation_products_product_id_fkey',
    );
  });

  it('deletes a product once its generation is gone', async () => {
    const { generation, product } = await userWithGeneration();
    await db.aiGeneration.delete({ where: { id: generation.id } });
    await expect(db.product.delete({ where: { id: product.id } })).resolves.toBeDefined();
  });
});
