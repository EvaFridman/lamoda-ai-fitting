import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '../../src/generated/prisma/client.js';
import { generationResultKey } from '../../src/storage/keys.js';
import { createTestDatabaseUrl } from '../support/test-database.js';

// Migration 20261029120000_fitting_seen (spec 0024 T15, AC30) on rows written as the previous
// release does, with no `seen_at` column. The database is a copy of the migrated template, put
// back into the state before the migration.
const MIGRATION = '20261029120000_fitting_seen';
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);

const FINISHED = new Date('2026-10-20T10:00:00.000Z');

let db: PrismaClient;
let userId: string;
const ids = { completed: randomUUID(), pending: randomUUID(), failed: randomUUID() };

async function generation(
  sessionId: string,
  id: string,
  status: 'completed' | 'pending' | 'failed',
): Promise<void> {
  // createMany returns no columns, so it works while `seen_at` does not exist.
  await db.aiGeneration.createMany({
    data: [
      {
        id,
        sessionId,
        userId,
        kind: 'single',
        userImageKey: 'users/abc/photo.jpg',
        status,
        aiProvider: 'test-provider',
        aiModel: 'test-model',
        ...(status === 'completed'
          ? {
              resultImageKey: generationResultKey(userId, id),
              startedAt: new Date('2026-10-20T09:59:00.000Z'),
              finishedAt: FINISHED,
            }
          : {}),
        ...(status === 'failed'
          ? {
              errorMessage: 'boom',
              failureCode: 'provider_error' as const,
              startedAt: new Date('2026-10-20T09:59:00.000Z'),
              finishedAt: FINISHED,
            }
          : {}),
      },
    ],
  });
}

beforeAll(async () => {
  const url = await createTestDatabaseUrl();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  await db.$executeRawUnsafe('DROP INDEX ai_generations_unseen_idx');
  await db.$executeRawUnsafe('ALTER TABLE ai_generations DROP COLUMN seen_at');
  await db.$executeRaw`DELETE FROM _prisma_migrations WHERE migration_name = ${MIGRATION}`;

  userId = (await db.user.create({ data: { email: `${randomUUID()}@example.com` } })).id;
  const session = await db.fittingSession.create({ data: { userId, isActive: true } });
  await generation(session.id, ids.completed, 'completed');
  await generation(session.id, ids.pending, 'pending');
  await generation(session.id, ids.failed, 'failed');

  await run(join(apiRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

const unseenCount = async () =>
  (
    await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ai_generations
      WHERE user_id = ${userId}::uuid AND status = 'completed'
        AND kind IS NOT NULL AND seen_at IS NULL`
  )[0]?.n;

describe('migration fitting_seen', () => {
  it('records the migration', async () => {
    const recorded = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM _prisma_migrations
      WHERE migration_name = ${MIGRATION} AND finished_at IS NOT NULL`;
    expect(recorded[0]?.n).toBe(1);
  });

  it('marks a completed row from before as seen at its finish, and leaves the others unseen', async () => {
    const rows = await db.aiGeneration.findMany({ where: { userId } });
    const seenAt = (id: string) => rows.find((row) => row.id === id)?.seenAt;

    expect(seenAt(ids.completed)).toEqual(FINISHED);
    expect(seenAt(ids.pending)).toBeNull();
    expect(seenAt(ids.failed)).toBeNull();
    expect(await unseenCount()).toBe(0);
  });

  it('counts a completed row inserted after the migration without seen_at as unseen', async () => {
    const session = await db.fittingSession.create({ data: { userId, isActive: false } });
    const id = randomUUID();
    await generation(session.id, id, 'completed');

    expect(await unseenCount()).toBe(1);
    expect((await db.aiGeneration.findUniqueOrThrow({ where: { id } })).seenAt).toBeNull();
  });

  it('creates the partial index of the unseen rows', async () => {
    const found = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'ai_generations_unseen_idx'`;

    expect(found).toHaveLength(1);
    const definition = found[0]?.indexdef ?? '';
    expect(definition).toContain('user_id');
    expect(definition).toMatch(/WHERE/);
    expect(definition).toContain('seen_at IS NULL');
    expect(definition).toContain('completed');
  });
});
