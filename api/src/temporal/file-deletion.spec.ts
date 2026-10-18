import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileDeletion } from './file-deletion.js';
import type { WorkflowStarter } from './workflow-starter.js';

vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));

function setup() {
  const start = vi.fn<(type: string, options: unknown) => Promise<void>>();
  const fileDeletion = new FileDeletion({ start } as unknown as WorkflowStarter);
  return { fileDeletion, start };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(Sentry.captureException).mockClear();
});

describe('FileDeletion.startFileDeletion', () => {
  it('starts nothing for no prefixes', async () => {
    const { fileDeletion, start } = setup();

    await fileDeletion.startFileDeletion('session', 'id-1', []);

    expect(start).not.toHaveBeenCalled();
  });

  it('starts deleteFiles under an id of the kind and the row', async () => {
    const { fileDeletion, start } = setup();
    start.mockResolvedValue();

    await fileDeletion.startFileDeletion('generation', 'gen-1', [
      'keep/users/u/generations/gen-1/',
    ]);

    expect(start).toHaveBeenCalledExactlyOnceWith('deleteFiles', {
      workflowId: 'delete-files-generation-gen-1',
      args: [{ prefixes: ['keep/users/u/generations/gen-1/'] }],
    });
  });

  it('does not throw when the start fails; logs it with the prefixes, reports it without them (M32)', async () => {
    const { fileDeletion, start } = setup();
    const failure = new Error('Temporal is down');
    start.mockRejectedValue(failure);
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await expect(
      fileDeletion.startFileDeletion('user', 'u-1', ['keep/users/u-1/']),
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledOnce();
    expect(logged.mock.calls[0]?.[0]).toMatchObject({
      err: failure,
      kind: 'user',
      id: 'u-1',
      prefixes: ['keep/users/u-1/'],
    });
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(failure, {
      extra: { kind: 'user', id: 'u-1' },
    });
    const extra = vi.mocked(Sentry.captureException).mock.calls[0]?.[1] as {
      extra: Record<string, unknown>;
    };
    expect(extra.extra).not.toHaveProperty('prefixes');
  });
});
