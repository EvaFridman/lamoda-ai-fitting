import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient, type Prisma } from '../../src/generated/prisma/client.js';
import { createTestDatabaseUrl } from '../support/test-database.js';
import { expectViolation } from '../support/violation.js';

// Migration 20261023120000_fittings (spec 0019, plan §2) on a database holding generations as the
// previous release wrote them: with a user image key and none of the new columns. The database is a
// copy of the migrated template, put back into the state before the migration.
const MIGRATION = '20261023120000_fittings';
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);

type Status = 'pending' | 'processing' | 'completed' | 'failed';

interface OldRow {
  id: string;
  userId: string;
  sessionId: string;
  status: Status;
}

let db: PrismaClient;
let counter = 0;
const oldRows: OldRow[] = [];
const oldLinks: { generationId: string; productId: string }[] = [];

function next(): number {
  counter += 1;
  return counter;
}

function createUser() {
  return db.user.create({ data: { email: `${randomUUID()}@example.com` } });
}

function createSession(userId: string) {
  return db.fittingSession.create({ data: { userId, isActive: false } });
}

async function createProduct() {
  const n = next();
  const [brand, category] = await Promise.all([
    db.brand.create({ data: { name: `Brand ${randomUUID()}` } }),
    db.category.create({
      data: { name: `Category ${randomUUID()}`, slug: `c-${randomUUID()}`, isActive: true },
    }),
  ]);
  return db.product.create({
    data: {
      article: `ART-${randomUUID()}-${n}`,
      name: `Product ${n}`,
      price: '100.00',
      brandId: brand.id,
      categoryId: category.id,
    },
  });
}

// The previous release's insert: its own columns only.
async function insertOld(sessionId: string, status: Status): Promise<string> {
  const resultKey = status === 'completed' ? 'results/abc/out.png' : null;
  const errorMessage = status === 'failed' ? 'PROVIDER_TIMEOUT' : null;
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO ai_generations
      (session_id, user_image_key, result_image_key, status, ai_provider, ai_model, error_message)
    VALUES (${sessionId}::uuid, 'users/abc/photo.jpg', ${resultKey}, ${status}::generation_status,
      'openai', 'gpt-image-1', ${errorMessage})
    RETURNING id`;
  return (rows[0] as { id: string }).id;
}

beforeAll(async () => {
  const url = await createTestDatabaseUrl();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  // The state before the migration: its columns, types and constraints gone, the status rule of
  // the earlier release, the migration not recorded.
  await db.$executeRawUnsafe(`ALTER TABLE ai_generations
    DROP COLUMN counts_against_limit, DROP COLUMN failure_code, DROP COLUMN fingerprint,
    DROP COLUMN finished_at, DROP COLUMN kind, DROP COLUMN parent_id, DROP COLUMN photo_id,
    DROP COLUMN prompt_text, DROP COLUMN provider_request_id, DROP COLUMN regeneration_reasons,
    DROP COLUMN started_at, DROP COLUMN user_id, ALTER COLUMN user_image_key SET NOT NULL`);
  // The owner keys went with the columns; the unique indexes they pointed at stay on the others.
  await db.$executeRawUnsafe(
    'DROP INDEX fitting_sessions_id_user_id_key, user_photos_id_user_id_key',
  );
  await db.$executeRawUnsafe(`ALTER TABLE ai_generations
    DROP CONSTRAINT IF EXISTS ai_generations_status_check,
    ADD CONSTRAINT ai_generations_status_check CHECK (
      (status = 'completed' AND result_image_key IS NOT NULL AND error_message IS NULL)
      OR (status = 'failed' AND error_message IS NOT NULL)
      OR (status IN ('pending', 'processing') AND result_image_key IS NULL AND error_message IS NULL)
    )`);
  await db.$executeRawUnsafe(
    'ALTER TABLE generation_products DROP COLUMN attribute_value_id, DROP COLUMN slot',
  );
  await db.$executeRawUnsafe('DROP TYPE fitting_kind, fitting_failure');
  await db.$executeRaw`DELETE FROM _prisma_migrations WHERE migration_name = ${MIGRATION}`;

  // Old rows: two users, a generation of every status each, a link on each.
  for (let i = 0; i < 2; i += 1) {
    const user = await createUser();
    const session = await createSession(user.id);
    for (const status of ['pending', 'processing', 'completed', 'failed'] as const) {
      const id = await insertOld(session.id, status);
      const product = await createProduct();
      await db.$executeRaw`INSERT INTO generation_products (generation_id, product_id)
        VALUES (${id}::uuid, ${product.id}::uuid)`;
      oldRows.push({ id, userId: user.id, sessionId: session.id, status });
      oldLinks.push({ generationId: id, productId: product.id });
    }
  }

  await run(join(apiRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

// A fitting generation of a fresh user; `patch` overrides the columns.
async function fitting(patch: Partial<Prisma.AiGenerationUncheckedCreateInput> = {}) {
  const user = await createUser();
  const session = await createSession(user.id);
  return db.aiGeneration.create({
    data: {
      sessionId: session.id,
      userId: user.id,
      status: 'pending',
      aiProvider: 'openai',
      aiModel: 'gpt-image-1',
      ...patch,
    },
  });
}

// Another generation of the same user as `row`, so the unique index sees one user.
function sibling(
  row: { userId: string | null; sessionId: string },
  patch: Partial<Prisma.AiGenerationUncheckedCreateInput>,
) {
  return db.aiGeneration.create({
    data: {
      sessionId: row.sessionId,
      userId: row.userId,
      status: 'pending',
      aiProvider: 'openai',
      aiModel: 'gpt-image-1',
      ...patch,
    },
  });
}

const FINGERPRINT = (c: string) => c.repeat(64);

describe('migration fittings: the rows of the previous release', () => {
  it('records the migration', async () => {
    const recorded = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM _prisma_migrations
      WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL`;
    expect(recorded[0]?.n).toBe(1);
  });

  it('fills user_id from the session for every old row (A23)', async () => {
    expect(oldRows).toHaveLength(8);
    for (const old of oldRows) {
      const row = await db.aiGeneration.findUniqueOrThrow({ where: { id: old.id } });
      expect(row.userId, old.status).toBe(old.userId);
    }
  });

  it('gives the old rows no kind, the limit counted and no reasons', async () => {
    for (const old of oldRows) {
      const row = await db.aiGeneration.findUniqueOrThrow({ where: { id: old.id } });
      expect(row.kind).toBeNull();
      expect(row.countsAgainstLimit).toBe(true);
      expect(row.regenerationReasons).toEqual([]);
      expect(row.userImageKey).toBe('users/abc/photo.jpg');
      expect(row.status).toBe(old.status);
      expect(row.failureCode).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.photoId).toBeNull();
      expect(row.parentId).toBeNull();
    }
  });

  it('keeps the links of the old rows, with no colour and no slot', async () => {
    for (const link of oldLinks) {
      const row = await db.generationProduct.findUniqueOrThrow({
        where: { generationId_productId: link },
      });
      expect(row.attributeValueId).toBeNull();
      expect(row.slot).toBeNull();
    }
  });

  it('still passes the status rule on the old rows', async () => {
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ai_generations WHERE id = ANY(${oldRows.map((r) => r.id)}::uuid[])`;
    expect(rows[0]?.n).toBe(8);
    // Touching a row re-checks it.
    await db.$executeRaw`UPDATE ai_generations SET ai_model = 'm2'
      WHERE id = ANY(${oldRows.map((r) => r.id)}::uuid[])`;
  });

  it('accepts a row inserted the previous release way after the migration', async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    const id = await insertOld(session.id, 'failed');
    const done = await insertOld(session.id, 'completed');

    const rows = await db.aiGeneration.findMany({ where: { id: { in: [id, done] } } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.userId).toBeNull();
      expect(row.kind).toBeNull();
      expect(row.countsAgainstLimit).toBe(true);
      expect(row.regenerationReasons).toEqual([]);
    }
  });

  it('accepts a user image key left out (A24)', async () => {
    const row = await fitting({ userImageKey: null });
    expect(row.userImageKey).toBeNull();
  });
});

describe('migration fittings: the status rule (ai_generations_status_check)', () => {
  it('accepts failed with only a failure code, or with a message, or both', async () => {
    await expect(fitting({ status: 'failed', failureCode: 'photo_dark' })).resolves.toBeDefined();
    await expect(fitting({ status: 'failed', errorMessage: 'x' })).resolves.toBeDefined();
    await expect(
      fitting({ status: 'failed', errorMessage: 'x', failureCode: 'moderation' }),
    ).resolves.toBeDefined();
  });

  it('refuses failed with neither', async () => {
    await expectViolation(fitting({ status: 'failed' }), 'ai_generations_status_check');
  });

  it('refuses completed with a failure code', async () => {
    await expectViolation(
      fitting({ status: 'completed', resultImageKey: 'results/a.png', failureCode: 'photo_dark' }),
      'ai_generations_status_check',
    );
  });

  it.each(['pending', 'processing'] as const)('refuses %s with a failure code', async (status) => {
    await expectViolation(
      fitting({ status, failureCode: 'provider_error' }),
      'ai_generations_status_check',
    );
  });
});

describe('migration fittings: the column rules', () => {
  it('accepts a lower-case sha256 and refuses an upper-case or short one', async () => {
    await expect(fitting({ fingerprint: 'a1'.repeat(32) })).resolves.toBeDefined();
    await expectViolation(
      fitting({ fingerprint: 'A'.repeat(64) }),
      'ai_generations_fingerprint_check',
    );
    await expectViolation(
      fitting({ fingerprint: 'a'.repeat(63) }),
      'ai_generations_fingerprint_check',
    );
    await expectViolation(
      fitting({ fingerprint: 'g'.repeat(64) }),
      'ai_generations_fingerprint_check',
    );
  });

  it('accepts a trimmed prompt and refuses an empty or untrimmed one', async () => {
    await expect(fitting({ promptText: 'a red jacket' })).resolves.toBeDefined();
    await expectViolation(fitting({ promptText: '' }), 'ai_generations_prompt_text_check');
    await expectViolation(fitting({ promptText: ' jacket' }), 'ai_generations_prompt_text_check');
    await expectViolation(fitting({ promptText: 'jacket ' }), 'ai_generations_prompt_text_check');
    await expectViolation(fitting({ promptText: 'jacket\n' }), 'ai_generations_prompt_text_check');
    await expectViolation(fitting({ promptText: '\tjacket' }), 'ai_generations_prompt_text_check');
    await expect(fitting({ promptText: 'a' })).resolves.toBeDefined();
    await expect(fitting({ promptText: 'red\nshirt' })).resolves.toBeDefined();
    await expect(fitting({ promptText: 'x'.repeat(300) })).resolves.toBeDefined();
  });

  it('refuses an empty provider request id', async () => {
    await expect(fitting({ providerRequestId: 'req_1' })).resolves.toBeDefined();
    await expectViolation(
      fitting({ providerRequestId: '' }),
      'ai_generations_provider_request_id_check',
    );
  });

  it('refuses NULL regeneration reasons', async () => {
    const row = await fitting({ regenerationReasons: ['colour'] });
    expect(row.regenerationReasons).toEqual(['colour']);
    await expectViolation(
      db.$executeRaw`UPDATE ai_generations SET regeneration_reasons = NULL WHERE id = ${row.id}::uuid`,
      'ai_generations_regeneration_reasons_check',
    );
  });
});

describe('migration fittings: one running generation per user and fingerprint (A32)', () => {
  it.each(['pending', 'processing'] as const)(
    'refuses two %s ones with the same fingerprint',
    async (status) => {
      const first = await fitting({ status, fingerprint: FINGERPRINT('1') });
      await expectViolation(
        sibling(first, { status: 'pending', fingerprint: FINGERPRINT('1') }),
        'ai_generations_user_id_fingerprint_key',
      );
    },
  );

  it('refuses a pending one beside a processing one', async () => {
    const first = await fitting({ status: 'processing', fingerprint: FINGERPRINT('2') });
    await expectViolation(
      sibling(first, { status: 'pending', fingerprint: FINGERPRINT('2') }),
      'ai_generations_user_id_fingerprint_key',
    );
  });

  it('allows a completed one beside a pending one, and two completed ones', async () => {
    const done = await fitting({
      status: 'completed',
      resultImageKey: 'results/a.png',
      fingerprint: FINGERPRINT('3'),
    });
    await sibling(done, { status: 'pending', fingerprint: FINGERPRINT('3') });
    await sibling(done, {
      status: 'completed',
      resultImageKey: 'results/b.png',
      fingerprint: FINGERPRINT('3'),
    });
    expect(
      await db.aiGeneration.count({
        where: { userId: done.userId, fingerprint: FINGERPRINT('3') },
      }),
    ).toBe(3);
  });

  it('allows the same fingerprint for another user, and other fingerprints for one', async () => {
    const first = await fitting({ fingerprint: FINGERPRINT('4') });
    await fitting({ fingerprint: FINGERPRINT('4') });
    await sibling(first, { fingerprint: FINGERPRINT('5') });
  });

  it('never conflicts on NULL fingerprints or a NULL user', async () => {
    const first = await fitting();
    await sibling(first, {});
    await sibling(first, {});
    const user = await createUser();
    const session = await createSession(user.id);
    await insertOld(session.id, 'pending');
    await insertOld(session.id, 'pending');
  });
});

describe('migration fittings: references', () => {
  it('keeps a generation when its photo is deleted (A24)', async () => {
    const user = await createUser();
    const photo = await db.userPhoto.create({
      data: {
        userId: user.id,
        imageKey: `keep/users/${user.id}/photos/${randomUUID()}.webp`,
        width: 1,
        height: 1,
      },
    });
    const session = await createSession(user.id);
    const row = await db.aiGeneration.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        photoId: photo.id,
        userImageKey: null,
        status: 'pending',
        aiProvider: 'openai',
        aiModel: 'gpt-image-1',
      },
    });

    await db.userPhoto.delete({ where: { id: photo.id } });

    const kept = await db.aiGeneration.findUniqueOrThrow({ where: { id: row.id } });
    expect(kept.photoId).toBeNull();
    expect(kept.userId).toBe(user.id);
  });

  it('refuses an unknown photo and parent', async () => {
    await expectViolation(
      fitting({ photoId: randomUUID() }),
      'ai_generations_photo_id_user_id_fkey',
    );
    await expectViolation(
      fitting({ parentId: randomUUID() }),
      'ai_generations_parent_id_user_id_fkey',
    );
  });

  it('keeps a regeneration when its parent is deleted', async () => {
    const parent = await fitting({
      status: 'completed',
      resultImageKey: 'results/a.png',
      fingerprint: FINGERPRINT('6'),
    });
    const child = await sibling(parent, { parentId: parent.id });

    await db.aiGeneration.delete({ where: { id: parent.id } });

    const kept = await db.aiGeneration.findUniqueOrThrow({ where: { id: child.id } });
    expect(kept.parentId).toBeNull();
    expect(kept.userId).toBe(parent.userId);
  });

  it('deletes the generations with the user', async () => {
    const row = await fitting({ fingerprint: FINGERPRINT('7') });
    const product = await createProduct();
    await db.generationProduct.create({
      data: { generationId: row.id, productId: product.id },
    });

    await db.user.delete({ where: { id: row.userId as string } });

    expect(await db.aiGeneration.count({ where: { id: row.id } })).toBe(0);
    expect(await db.generationProduct.count({ where: { generationId: row.id } })).toBe(0);
  });

  it('refuses to delete an attribute value a link uses (RESTRICT)', async () => {
    const attribute = await db.attribute.create({ data: { name: `Colour ${randomUUID()}` } });
    const value = await db.attributeValue.create({
      data: { attributeId: attribute.id, value: 'red', colorHex: '#FF0000' },
    });
    const row = await fitting();
    const product = await createProduct();
    await db.generationProduct.create({
      data: {
        generationId: row.id,
        productId: product.id,
        attributeValueId: value.id,
        slot: 'top',
      },
    });

    await expectViolation(
      db.attributeValue.delete({ where: { id: value.id } }),
      'generation_products_attribute_value_id_fkey',
    );
    expect(await db.attributeValue.count({ where: { id: value.id } })).toBe(1);
  });

  it('refuses a link to an unknown attribute value', async () => {
    const row = await fitting();
    const product = await createProduct();
    await expectViolation(
      db.generationProduct.create({
        data: { generationId: row.id, productId: product.id, attributeValueId: randomUUID() },
      }),
      'generation_products_attribute_value_id_fkey',
    );
  });
});

describe('migration fittings: owner keys (A65)', () => {
  async function photoOf(userId: string) {
    return db.userPhoto.create({
      data: {
        userId,
        imageKey: `keep/users/${userId}/photos/${randomUUID()}.webp`,
        width: 1,
        height: 1,
      },
    });
  }

  async function ownerWithSession() {
    const user = await createUser();
    const session = await createSession(user.id);
    return { user, session };
  }

  function generation(
    patch: Partial<Prisma.AiGenerationUncheckedCreateInput> & { sessionId: string },
  ) {
    return db.aiGeneration.create({
      data: { status: 'pending', aiProvider: 'openai', aiModel: 'gpt-image-1', ...patch },
    });
  }

  it('refuses the photo of another user', async () => {
    const a = await ownerWithSession();
    const b = await createUser();
    const photo = await photoOf(b.id);

    await expectViolation(
      generation({ sessionId: a.session.id, userId: a.user.id, photoId: photo.id }),
      'ai_generations_photo_id_user_id_fkey',
    );
  });

  it('accepts the photo of the same user', async () => {
    const a = await ownerWithSession();
    const photo = await photoOf(a.user.id);

    await expect(
      generation({ sessionId: a.session.id, userId: a.user.id, photoId: photo.id }),
    ).resolves.toBeDefined();
  });

  it('refuses a parent of another user', async () => {
    const a = await ownerWithSession();
    const b = await ownerWithSession();
    const parent = await generation({ sessionId: b.session.id, userId: b.user.id });

    await expectViolation(
      generation({ sessionId: a.session.id, userId: a.user.id, parentId: parent.id }),
      'ai_generations_parent_id_user_id_fkey',
    );
  });

  it('refuses a user_id with the session of another user', async () => {
    const a = await createUser();
    const b = await ownerWithSession();

    await expectViolation(
      generation({ sessionId: b.session.id, userId: a.id }),
      'ai_generations_session_id_user_id_fkey',
    );
  });

  it.each(['photo', 'parent'] as const)(
    'refuses a %s on a row with a NULL user_id (owner_check)',
    async (kind) => {
      const a = await ownerWithSession();
      const photo = await photoOf(a.user.id);
      const parent = await generation({ sessionId: a.session.id, userId: a.user.id });

      await expectViolation(
        generation({
          sessionId: a.session.id,
          userId: null,
          ...(kind === 'photo' ? { photoId: photo.id } : { parentId: parent.id }),
        }),
        'ai_generations_owner_check',
      );
    },
  );

  it('sets only photo_id to NULL when the photo is deleted, and keeps user_id', async () => {
    const a = await ownerWithSession();
    const photo = await photoOf(a.user.id);
    const row = await generation({
      sessionId: a.session.id,
      userId: a.user.id,
      photoId: photo.id,
    });

    await db.userPhoto.delete({ where: { id: photo.id } });

    const kept = await db.aiGeneration.findUniqueOrThrow({ where: { id: row.id } });
    expect(kept.photoId).toBeNull();
    expect(kept.userId).toBe(a.user.id);
    expect(kept.sessionId).toBe(a.session.id);
  });

  it('sets only parent_id to NULL when the parent is deleted, and keeps user_id', async () => {
    const a = await ownerWithSession();
    const parent = await generation({ sessionId: a.session.id, userId: a.user.id });
    const child = await generation({
      sessionId: a.session.id,
      userId: a.user.id,
      parentId: parent.id,
    });

    await db.aiGeneration.delete({ where: { id: parent.id } });

    const kept = await db.aiGeneration.findUniqueOrThrow({ where: { id: child.id } });
    expect(kept.parentId).toBeNull();
    expect(kept.userId).toBe(a.user.id);
  });

  it('accepts a NULL user_id with a valid session, and deletes it with the session', async () => {
    const a = await ownerWithSession();
    const id = await insertOld(a.session.id, 'pending');
    expect((await db.aiGeneration.findUniqueOrThrow({ where: { id } })).userId).toBeNull();

    await db.fittingSession.delete({ where: { id: a.session.id } });

    expect(await db.aiGeneration.count({ where: { id } })).toBe(0);
  });

  it('refuses a NULL user_id with an unknown session (the plain key stays)', async () => {
    await expectViolation(
      generation({ sessionId: randomUUID(), userId: null }),
      'ai_generations_session_id_fkey',
    );
  });

  it('deletes the generations with their session', async () => {
    const a = await ownerWithSession();
    const row = await generation({ sessionId: a.session.id, userId: a.user.id });

    await db.fittingSession.delete({ where: { id: a.session.id } });

    expect(await db.aiGeneration.count({ where: { id: row.id } })).toBe(0);
  });

  it('refuses to change the user of a session that has a generation', async () => {
    const a = await ownerWithSession();
    const other = await createUser();
    await generation({ sessionId: a.session.id, userId: a.user.id });

    await expectViolation(
      db.$executeRaw`UPDATE fitting_sessions SET user_id = ${other.id}::uuid
        WHERE id = ${a.session.id}::uuid`,
      'ai_generations_session_id_user_id_fkey',
    );
    expect(
      (await db.fittingSession.findUniqueOrThrow({ where: { id: a.session.id } })).userId,
    ).toBe(a.user.id);
  });

  it('lets a session without generations change its user', async () => {
    const a = await ownerWithSession();
    const other = await createUser();

    await db.$executeRaw`UPDATE fitting_sessions SET user_id = ${other.id}::uuid
      WHERE id = ${a.session.id}::uuid`;

    expect(
      (await db.fittingSession.findUniqueOrThrow({ where: { id: a.session.id } })).userId,
    ).toBe(other.id);
  });

  it('refuses to change the user of a photo a generation uses', async () => {
    const a = await ownerWithSession();
    const other = await createUser();
    const photo = await photoOf(a.user.id);
    await generation({ sessionId: a.session.id, userId: a.user.id, photoId: photo.id });

    await expectViolation(
      db.$executeRaw`UPDATE user_photos
        SET user_id = ${other.id}::uuid,
          image_key = ${`keep/users/${other.id}/photos/${randomUUID()}.webp`}
        WHERE id = ${photo.id}::uuid`,
      'ai_generations_photo_id_user_id_fkey',
    );
    expect((await db.userPhoto.findUniqueOrThrow({ where: { id: photo.id } })).userId).toBe(
      a.user.id,
    );
  });

  it('refuses to change the user of a parent that has a child', async () => {
    const a = await ownerWithSession();
    const other = await createUser();
    const parent = await generation({ sessionId: a.session.id, userId: a.user.id });
    await generation({ sessionId: a.session.id, userId: a.user.id, parentId: parent.id });

    await expectViolation(
      db.$executeRaw`UPDATE ai_generations SET user_id = ${other.id}::uuid
        WHERE id = ${parent.id}::uuid`,
      'ai_generations_parent_id_user_id_fkey',
    );
    expect((await db.aiGeneration.findUniqueOrThrow({ where: { id: parent.id } })).userId).toBe(
      a.user.id,
    );
  });

  it('lets the backfilled old rows pass the new keys and the owner check', async () => {
    // A key added now checks every row, the old ones included.
    await db.$executeRawUnsafe(`ALTER TABLE ai_generations
      ADD CONSTRAINT tmp_session_owner FOREIGN KEY (session_id, user_id)
        REFERENCES fitting_sessions (id, user_id),
      ADD CONSTRAINT tmp_owner CHECK (user_id IS NOT NULL OR (photo_id IS NULL AND parent_id IS NULL))`);
    await db.$executeRawUnsafe(
      'ALTER TABLE ai_generations DROP CONSTRAINT tmp_session_owner, DROP CONSTRAINT tmp_owner',
    );
    const rows = await db.aiGeneration.findMany({
      where: { id: { in: oldRows.map((r) => r.id) } },
    });
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.userId !== null)).toBe(true);
  });
});
