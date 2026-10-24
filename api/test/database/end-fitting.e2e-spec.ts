import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { endFitting } from '../../src/fittings/end-fitting.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestDatabase } from '../support/test-database.js';

const HOUR = 3_600_000;
const outcome = {
  status: 'failed',
  failureCode: 'provider_error',
  errorMessage: 'test',
  providerRequestId: null,
} as const;

// The conditional update of `endFitting` (spec 0019 A67, A70): which rows it ends.
describe('endFitting options', () => {
  let prisma: PrismaClient;
  let userId: string;
  let sessionId: string;

  beforeAll(async () => {
    prisma = await createTestDatabase();
    const user = await prisma.user.create({
      data: { email: `user-${randomUUID()}@example.com`, emailVerified: true },
    });
    userId = user.id;
    sessionId = (await prisma.fittingSession.create({ data: { userId } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function row(status: 'pending' | 'processing', startedAt?: Date) {
    return prisma.aiGeneration.create({
      data: {
        sessionId,
        userId,
        kind: 'single',
        status,
        startedAt,
        countsAgainstLimit: false,
        fingerprint: randomUUID().replaceAll('-', '').repeat(2),
        aiProvider: 'fake',
        aiModel: 'gpt-image-2',
      },
    });
  }

  const statusOf = async (id: string) =>
    (await prisma.aiGeneration.findUniqueOrThrow({ where: { id } })).status;

  it('with from pending ends a pending row and leaves a processing one', async () => {
    const pending = await row('pending');
    const processing = await row('processing');

    await endFitting(prisma, pending.id, outcome, { from: ['pending'] });
    await endFitting(prisma, processing.id, outcome, { from: ['pending'] });

    expect(await statusOf(pending.id)).toBe('failed');
    expect(await statusOf(processing.id)).toBe('processing');
  });

  it("with claimed 'never' ends an unclaimed row and leaves a claimed one", async () => {
    const unclaimed = await row('processing');
    const claimed = await row('processing', new Date(Date.now() - 2 * HOUR));

    await endFitting(prisma, unclaimed.id, outcome, { claimed: 'never' });
    await endFitting(prisma, claimed.id, outcome, { claimed: 'never' });

    expect(await statusOf(unclaimed.id)).toBe('failed');
    expect(await statusOf(claimed.id)).toBe('processing');
  });

  it('with claimed before ends only a row claimed earlier, never an unclaimed one', async () => {
    const before = new Date(Date.now() - HOUR);
    const earlier = await row('processing', new Date(Date.now() - 2 * HOUR));
    const later = await row('processing', new Date(Date.now() - 10 * 60_000));
    const unclaimed = await row('processing');

    for (const { id } of [earlier, later, unclaimed]) {
      await endFitting(prisma, id, outcome, { claimed: { before } });
    }

    expect(await statusOf(earlier.id)).toBe('failed');
    expect(await statusOf(later.id)).toBe('processing');
    expect(await statusOf(unclaimed.id)).toBe('processing');
  });
});
