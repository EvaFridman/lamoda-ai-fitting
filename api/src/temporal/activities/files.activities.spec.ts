import { ApplicationFailure, CancelledFailure, Context } from '@temporalio/activity';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageError } from '../../storage/storage.error.js';
import type { StorageService } from '../../storage/storage.service.js';
import { createFileActivities } from './files.activities.js';

const USER = '0199c2f0-aaaa-7000-8000-000000000001';
const GENERATION = '0199c2f0-bbbb-7000-8000-000000000002';

function setup() {
  const deletePrefix = vi.fn<(prefix: string, signal?: AbortSignal) => Promise<number>>();
  const activities = createFileActivities({ deletePrefix } as unknown as StorageService);
  const cancellation = new AbortController();
  const current = vi
    .spyOn(Context, 'current')
    .mockReturnValue({ cancellationSignal: cancellation.signal } as Context);
  return { deletePrefix, activities, current, cancellation, signal: cancellation.signal };
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

    expect(deletePrefix).toHaveBeenCalledExactlyOnceWith(prefix, signal);
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
