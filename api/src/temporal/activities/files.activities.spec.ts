import { ApplicationFailure, CancelledFailure, Context } from '@temporalio/activity';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { StorageError } from '../../storage/storage.error.js';
import type { StorageService } from '../../storage/storage.service.js';
import { createFileActivities } from './files.activities.js';

const USER = '0199c2f0-aaaa-7000-8000-000000000001';
const GENERATION = '0199c2f0-bbbb-7000-8000-000000000002';

function setup() {
  const deletePrefix =
    vi.fn<
      (prefix: string, signal?: AbortSignal, onPage?: (deleted: number) => void) => Promise<number>
    >();
  const deleteMany = vi.fn<(args: unknown) => Promise<{ count: number }>>();
  deleteMany.mockResolvedValue({ count: 1 });
  const activities = createFileActivities(
    { deletePrefix } as unknown as StorageService,
    { fileDeletion: { deleteMany } } as unknown as PrismaClient,
  );
  const cancellation = new AbortController();
  const heartbeat = vi.fn<(details?: unknown) => void>();
  const current = vi
    .spyOn(Context, 'current')
    .mockReturnValue({ cancellationSignal: cancellation.signal, heartbeat } as unknown as Context);
  return {
    deletePrefix,
    deleteMany,
    heartbeat,
    activities,
    current,
    cancellation,
    signal: cancellation.signal,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('deletePrefix activity', () => {
  it.each([
    ['the media class', 'media/'],
    ['another class', 'keep/'],
    ['the users folder of a class', 'keep/users/'],
    ['a folder of another class', `other/users/${USER}/`],
    ['a subfolder that is not a generation', `keep/users/${USER}/photos/`],
    ['a folder without a trailing slash', `keep/users/${USER}`],
    [
      'a generation folder with a further segment',
      `keep/users/${USER}/generations/${GENERATION}/x/`,
    ],
    ['a path with dots', `keep/users/../`],
    ['an empty prefix', ''],
  ])('refuses %s without calling the storage', async (_name, prefix) => {
    const { activities, deletePrefix, current } = setup();

    const error: unknown = await activities.deletePrefix(prefix).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error).toMatchObject({ nonRetryable: true, type: 'InvalidPrefix' });
    expect((error as Error).message).not.toContain(prefix === '' ? USER : prefix);
    expect((error as Error).message).not.toContain(USER);
    expect(deletePrefix).not.toHaveBeenCalled();
    expect(current).not.toHaveBeenCalled();
  });

  it.each([
    ['a user folder', `keep/users/${USER}/`],
    ['a generation folder', `keep/users/${USER}/generations/${GENERATION}/`],
  ])('deletes %s with the cancellation signal and returns the count', async (_name, prefix) => {
    const { activities, deletePrefix, signal } = setup();
    deletePrefix.mockResolvedValue(7);

    await expect(activities.deletePrefix(prefix)).resolves.toBe(7);

    expect(deletePrefix).toHaveBeenCalledExactlyOnceWith(prefix, signal, expect.any(Function));
  });

  it('deletes a photo by its key', async () => {
    const { activities, deletePrefix } = setup();
    deletePrefix.mockResolvedValue(1);
    const key = `keep/users/${USER}/photos/${GENERATION}.webp`;

    await expect(activities.deletePrefix(key)).resolves.toBe(1);

    expect(deletePrefix.mock.calls[0]?.[0]).toBe(key);
  });

  it('heartbeats with the count of every request the storage reports', async () => {
    const { activities, deletePrefix, heartbeat } = setup();
    deletePrefix.mockImplementation((_prefix, _signal, onRequest) => {
      onRequest?.(0);
      onRequest?.(0);
      onRequest?.(1000);
      onRequest?.(1000);
      return Promise.resolve(1500);
    });

    await activities.deletePrefix(`keep/users/${USER}/`);

    expect(heartbeat.mock.calls).toEqual([[0], [0], [1000], [1000]]);
  });

  it('lets a storage error through as it is, so it is retried', async () => {
    const { activities, deletePrefix } = setup();
    const failure = new StorageError('ListObjectsV2', 'ECONNREFUSED', undefined, undefined);
    deletePrefix.mockRejectedValue(failure);

    await expect(activities.deletePrefix(`keep/users/${USER}/`)).rejects.toBe(failure);
  });

  it('throws the cancellation, not the storage error, when the attempt was cancelled', async () => {
    const { activities, deletePrefix, cancellation } = setup();
    const reason = new CancelledFailure('TIMED_OUT');
    deletePrefix.mockImplementation(() => {
      cancellation.abort(reason);
      return Promise.reject(new StorageError('ListObjectsV2', 'AbortError', undefined, undefined));
    });

    await expect(activities.deletePrefix(`keep/users/${USER}/`)).rejects.toBe(reason);
  });

  it('throws the storage error as it is when the attempt was not cancelled', async () => {
    const { activities, deletePrefix, signal } = setup();
    const failure = new StorageError('DeleteObjects', 'ETIMEDOUT', undefined, undefined);
    deletePrefix.mockRejectedValue(failure);

    await expect(activities.deletePrefix(`keep/users/${USER}/`)).rejects.toBe(failure);
    expect(signal.aborted).toBe(false);
  });
});

describe('completeFileDeletion activity', () => {
  it('deletes the outbox row by id', async () => {
    const { activities, deleteMany } = setup();

    await activities.completeFileDeletion('row-1');

    expect(deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: 'row-1' } });
  });

  it('does nothing and does not fail when the row is already gone', async () => {
    const { activities, deleteMany } = setup();
    deleteMany.mockResolvedValue({ count: 0 });

    await expect(activities.completeFileDeletion('row-1')).resolves.toBeUndefined();
  });

  it('lets a database failure through, so it is retried', async () => {
    const { activities, deleteMany } = setup();
    const failure = new Error('db down');
    deleteMany.mockRejectedValue(failure);

    await expect(activities.completeFileDeletion('row-1')).rejects.toBe(failure);
  });
});
