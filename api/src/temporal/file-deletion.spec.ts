import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { FileDeletion } from './file-deletion.js';
import type { QueuedFileDeletion } from './file-deletion-id.js';
import type { WorkflowStarter } from './workflow-starter.js';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

function setup() {
  const start = vi.fn<(type: string, options: unknown) => Promise<void>>();
  const updateMany = vi.fn<(args: unknown) => Promise<{ count: number }>>();
  updateMany.mockResolvedValue({ count: 1 });
  const fileDeletion = new FileDeletion(
    { start } as unknown as WorkflowStarter,
    { fileDeletion: { updateMany } } as unknown as PrismaService,
  );
  return { fileDeletion, start, updateMany };
}

const QUEUED: QueuedFileDeletion = {
  id: 'row-1',
  kind: 'generation',
  rowId: 'gen-1',
  prefixes: ['keep/users/u/generations/gen-1/'],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(Sentry.captureException).mockClear();
});

describe('FileDeletion.enqueue', () => {
  function tx() {
    const create = vi.fn<(args: unknown) => Promise<QueuedFileDeletion>>();
    create.mockResolvedValue(QUEUED);
    return { create, client: { fileDeletion: { create } } as unknown as Prisma.TransactionClient };
  }

  it('writes nothing for no prefixes and returns null', async () => {
    const { fileDeletion } = setup();
    const { create, client } = tx();

    await expect(fileDeletion.enqueue(client, 'session', 'id-1', [])).resolves.toBeNull();

    expect(create).not.toHaveBeenCalled();
  });

  it("inserts the row in the caller's transaction and returns it", async () => {
    const { fileDeletion } = setup();
    const { create, client } = tx();

    const queued = await fileDeletion.enqueue(client, 'generation', 'gen-1', QUEUED.prefixes);

    expect(queued).toEqual(QUEUED);
    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: { kind: 'generation', rowId: 'gen-1', prefixes: QUEUED.prefixes },
      select: { id: true, kind: true, rowId: true, prefixes: true },
    });
  });

  it('lets a failed insert through, so the delete rolls back', async () => {
    const { fileDeletion } = setup();
    const { create, client } = tx();
    const failure = new Error('insert failed');
    create.mockRejectedValue(failure);

    await expect(fileDeletion.enqueue(client, 'user', 'u-1', ['keep/users/u-1/'])).rejects.toBe(
      failure,
    );
  });
});

describe('FileDeletion.start', () => {
  it('starts nothing for null', async () => {
    const { fileDeletion, start, updateMany } = setup();

    await fileDeletion.start(null);

    expect(start).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('starts deleteFiles under an id of the kind and the row, with the outbox id', async () => {
    const { fileDeletion, start } = setup();
    start.mockResolvedValue();

    await fileDeletion.start(QUEUED);

    expect(start).toHaveBeenCalledExactlyOnceWith('deleteFiles', {
      workflowId: 'delete-files-generation-gen-1',
      args: [{ prefixes: QUEUED.prefixes, deletionId: 'row-1' }],
    });
  });

  it('marks the row started after the start, only while it is unmarked', async () => {
    const { fileDeletion, start, updateMany } = setup();
    start.mockResolvedValue();

    await fileDeletion.start(QUEUED);

    expect(updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'row-1', startedAt: null },
      data: { startedAt: expect.any(Date) },
    });
    expect(start.mock.invocationCallOrder[0]).toBeLessThan(
      updateMany.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not throw, mark or report when the start fails; logs the kind and the id only', async () => {
    const { fileDeletion, start, updateMany } = setup();
    const failure = new Error('Temporal is down');
    start.mockRejectedValue(failure);
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    await expect(fileDeletion.start(QUEUED)).resolves.toBeUndefined();

    expect(updateMany).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledOnce();
    const entry = logged.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      msg: 'Could not start the deletion of files; the housekeeping schedule starts it',
      err: failure,
      kind: 'generation',
      id: 'gen-1',
    });
    expect(entry).not.toHaveProperty('prefixes');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('does not throw or report when marking the row fails', async () => {
    const { fileDeletion, start, updateMany } = setup();
    start.mockResolvedValue();
    const failure = new Error('db down');
    updateMany.mockRejectedValue(failure);
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    await expect(fileDeletion.start(QUEUED)).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledOnce();
    const entry = logged.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      msg: 'The deletion of files started but its row was not marked; the housekeeping schedule starts it again',
      err: failure,
      kind: 'generation',
      id: 'gen-1',
    });
    expect(entry).not.toHaveProperty('prefixes');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
