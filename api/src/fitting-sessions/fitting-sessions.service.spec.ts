import { describe, expect, it, vi } from 'vitest';

import { UnauthorizedError } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { FileDeletion } from '../temporal/file-deletion.js';
import { FittingSessionsService } from './fitting-sessions.service.js';

function foreignKeyError(constraint: string) {
  return new Prisma.PrismaClientKnownRequestError('prisma failed', {
    code: 'P2003',
    clientVersion: '7.10.0',
    meta: { driverAdapterError: { cause: { constraint: { index: constraint } } } },
  });
}

function serviceFailingWith(error: unknown) {
  const prisma = { $transaction: vi.fn().mockRejectedValue(error) };
  return new FittingSessionsService(
    prisma as unknown as PrismaService,
    {} as unknown as FileDeletion,
  );
}

describe('FittingSessionsService.create', () => {
  it('answers 401 when the signed-in user is gone (P2003 on fitting_sessions_user_id_fkey)', async () => {
    const service = serviceFailingWith(foreignKeyError('fitting_sessions_user_id_fkey'));

    await expect(service.create('user-id', {})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rethrows a P2003 on another constraint unchanged, for RELATED_NOT_FOUND', async () => {
    const original = foreignKeyError('some_other_fkey');
    const service = serviceFailingWith(original);

    await expect(service.create('user-id', {})).rejects.toBe(original);
  });

  it('rethrows any other error unchanged', async () => {
    const original = new Error('boom');
    const service = serviceFailingWith(original);

    await expect(service.create('user-id', {})).rejects.toBe(original);
  });
});
