import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  AUTH_CLEANUP_BATCH_SIZE,
  createAuthCleanupActivities,
} from '../../src/temporal/activities/auth-cleanup.activities.js';
import { createTestDatabase } from '../support/test-database.js';

// The activity needs an activity context, which only a worker provides; a stand-in carries the
// cancellation signal and records the heartbeats. The SQL runs on the real database.
const context = vi.hoisted(() => ({
  controller: new AbortController(),
  beats: [] as unknown[],
  onBeat: undefined as undefined | (() => void),
  heartbeatDetails: undefined as undefined | { sessions: number; verifications: number },
}));

vi.mock('@temporalio/activity', () => ({
  Context: {
    current: () => ({
      info: {
        get heartbeatDetails() {
          return context.heartbeatDetails;
        },
      },
      get cancellationSignal() {
        return context.controller.signal;
      },
      heartbeat: (details: object) => {
        context.beats.push({ ...details });
        context.onBeat?.();
      },
    }),
  },
}));

type Table = 'sessions' | 'verifications';

describe('deleteExpiredAuthRows activity (database)', () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = await createTestDatabase();
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.com` } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    context.controller = new AbortController();
    context.beats = [];
    context.onBeat = undefined;
    context.heartbeatDetails = undefined;
    await prisma.session.deleteMany();
    await prisma.verification.deleteMany();
  });

  // Rows expiring `seconds` from the database's now() (negative: already expired), so the host's
  // clock does not matter.
  async function insert(table: Table, count: number, seconds: number): Promise<void> {
    if (table === 'sessions') {
      await prisma.$executeRaw`
        INSERT INTO sessions (token, user_id, expires_at)
        SELECT gen_random_uuid()::text, ${userId}::uuid, now() + (${seconds}::int * interval '1 second')
        FROM generate_series(1, ${count}::int)`;
    } else {
      await prisma.$executeRaw`
        INSERT INTO verifications (identifier, value, expires_at)
        SELECT gen_random_uuid()::text, 'v', now() + (${seconds}::int * interval '1 second')
        FROM generate_series(1, ${count}::int)`;
    }
  }

  const counts = async () => ({
    sessions: await prisma.session.count(),
    verifications: await prisma.verification.count(),
  });

  it('deletes expired rows of both tables and keeps live ones', async () => {
    await insert('sessions', 3, -60);
    await insert('sessions', 2, 3600);
    await insert('verifications', 4, -60);
    await insert('verifications', 1, 3600);

    const result = await createAuthCleanupActivities(prisma).deleteExpiredAuthRows();

    expect(result).toEqual({ sessions: 3, verifications: 4 });
    expect(await counts()).toEqual({ sessions: 2, verifications: 1 });
  });

  it('keeps a row that expires only a little later', async () => {
    await insert('sessions', 1, 30);
    await insert('verifications', 1, 30);

    const result = await createAuthCleanupActivities(prisma).deleteExpiredAuthRows();

    expect(result).toEqual({ sessions: 0, verifications: 0 });
    expect(await counts()).toEqual({ sessions: 1, verifications: 1 });
  });

  it('deletes more than one batch of one table, with the right counts', async () => {
    const expired = AUTH_CLEANUP_BATCH_SIZE * 2 + 1;
    await insert('sessions', expired, -60);
    await insert('sessions', 3, 3600);
    await insert('verifications', AUTH_CLEANUP_BATCH_SIZE + 1, -60);

    const result = await createAuthCleanupActivities(prisma).deleteExpiredAuthRows();

    expect(result).toEqual({ sessions: expired, verifications: AUTH_CLEANUP_BATCH_SIZE + 1 });
    expect(await counts()).toEqual({ sessions: 3, verifications: 0 });
  });

  it('a table with exactly one full batch is deleted and checked once more', async () => {
    await insert('verifications', AUTH_CLEANUP_BATCH_SIZE, -60);

    const result = await createAuthCleanupActivities(prisma).deleteExpiredAuthRows();

    expect(result).toEqual({ sessions: 0, verifications: AUTH_CLEANUP_BATCH_SIZE });
    expect(await counts()).toEqual({ sessions: 0, verifications: 0 });
  });

  it('a repeat run deletes nothing', async () => {
    await insert('sessions', 5, -60);
    await insert('verifications', 5, -60);
    const activities = createAuthCleanupActivities(prisma);

    await activities.deleteExpiredAuthRows();

    await expect(activities.deleteExpiredAuthRows()).resolves.toEqual({
      sessions: 0,
      verifications: 0,
    });
  });

  it('heartbeats after each batch with the running counts', async () => {
    await insert('sessions', AUTH_CLEANUP_BATCH_SIZE + 1, -60);

    await createAuthCleanupActivities(prisma).deleteExpiredAuthRows();

    expect(context.beats).toEqual([
      { sessions: AUTH_CLEANUP_BATCH_SIZE, verifications: 0 },
      { sessions: AUTH_CLEANUP_BATCH_SIZE + 1, verifications: 0 },
      { sessions: AUTH_CLEANUP_BATCH_SIZE + 1, verifications: 0 },
    ]);
  });

  it('adds to the counts of the previous attempt taken from its last heartbeat', async () => {
    context.heartbeatDetails = { sessions: 5, verifications: 2 };
    await insert('sessions', 3, -60);

    const result = await createAuthCleanupActivities(prisma).deleteExpiredAuthRows();

    expect(result).toEqual({ sessions: 8, verifications: 2 });
    expect(context.beats.at(-1)).toEqual({ sessions: 8, verifications: 2 });
  });

  it('throws the cancellation reason before the first batch and deletes nothing', async () => {
    await insert('sessions', 2, -60);
    const reason = new Error('activity cancelled');
    context.controller.abort(reason);

    await expect(createAuthCleanupActivities(prisma).deleteExpiredAuthRows()).rejects.toBe(reason);

    expect(await counts()).toEqual({ sessions: 2, verifications: 0 });
  });

  it('stops between batches when cancelled', async () => {
    await insert('sessions', AUTH_CLEANUP_BATCH_SIZE * 2, -60);
    const reason = new Error('worker shutdown');
    context.onBeat = () => context.controller.abort(reason);

    await expect(createAuthCleanupActivities(prisma).deleteExpiredAuthRows()).rejects.toBe(reason);

    expect(await counts()).toEqual({ sessions: AUTH_CLEANUP_BATCH_SIZE, verifications: 0 });
  });
});
