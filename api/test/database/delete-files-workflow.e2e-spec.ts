import { randomUUID } from 'node:crypto';

import { Context } from '@temporalio/activity';
import {
  ApplicationFailure,
  CancelledFailure,
  Client,
  Connection,
  WorkflowFailedError,
} from '@temporalio/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  startTestWorkerWith,
  testTemporalSettings,
  type TestWorker,
} from '../support/test-temporal.js';

const settings = testTemporalSettings();
const TIMEOUT = 30_000;

function prefixes(count: number, tag: string): string[] {
  return Array.from({ length: count }, (_, i) => `keep/users/${tag}-${String(i)}/`);
}

// The workflow runs on the real throwaway Temporal with activities of the test: deleteFiles' own
// logic (batches, failures) is checked apart from the storage.
describe('deleteFiles workflow', () => {
  const calls: string[] = [];
  const refused = new Set<string>();
  const hung = new Set<string>();
  const completed: string[] = [];
  // Ends the hung stubs, so no activity outlives the test. They heartbeat while they wait: the
  // workflow's cancellation reaches an activity in the answer to a heartbeat, and the heartbeat
  // timeout does not fire.
  let releaseHung: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    releaseHung = resolve;
  });
  let client: Client;
  let connection: Connection | undefined;
  let worker: TestWorker | undefined;

  beforeAll(async () => {
    worker = await startTestWorkerWith(settings, {
      async deletePrefix(prefix: string): Promise<number> {
        calls.push(prefix);
        if (refused.has(prefix)) {
          throw ApplicationFailure.nonRetryable('refused', 'InvalidPrefix');
        }
        if (hung.has(prefix)) {
          const context = Context.current();
          const beat = setInterval(() => {
            context.heartbeat();
          }, 500);
          try {
            await new Promise<void>((resolve) => {
              context.cancellationSignal.addEventListener('abort', () => {
                resolve();
              });
              void released.then(resolve);
            });
          } finally {
            clearInterval(beat);
          }
        }
        return 1;
      },
      completeFileDeletion(deletionId: string): Promise<void> {
        completed.push(deletionId);
        return Promise.resolve();
      },
    });
    connection = await Connection.connect({ address: settings.address });
    client = new Client({ connection, namespace: settings.namespace });
  }, 120_000);

  afterAll(async () => {
    releaseHung();
    await worker?.stop();
    await connection?.close();
  });

  function options() {
    return {
      taskQueue: settings.taskQueue,
      workflowId: `delete-files-test-${randomUUID()}`,
      workflowExecutionTimeout: '60 seconds',
    } as const;
  }

  function start(list: string[], deletionId?: string) {
    return client.workflow.execute('deleteFiles', {
      ...options(),
      args: [{ prefixes: list, deletionId }],
    });
  }

  it(
    'completes the outbox row with its id after a clean run',
    async () => {
      const id = randomUUID();

      await expect(start(prefixes(3, randomUUID()), id)).resolves.toBeUndefined();

      expect(completed.filter((done) => done === id)).toEqual([id]);
    },
    TIMEOUT,
  );

  it(
    'keeps the outbox row after a run with a refused folder',
    async () => {
      const id = randomUUID();
      const list = prefixes(3, randomUUID());
      refused.add(list[1] ?? '');

      await expect(start(list, id)).rejects.toBeInstanceOf(WorkflowFailedError);

      expect(completed).not.toContain(id);
    },
    TIMEOUT,
  );

  it(
    'completes no row for a run without a deletion id',
    async () => {
      const before = completed.length;

      await expect(start(prefixes(2, randomUUID()))).resolves.toBeUndefined();

      expect(completed).toHaveLength(before);
    },
    TIMEOUT,
  );

  it(
    'completes when every folder is deleted',
    async () => {
      const list = prefixes(25, randomUUID());

      await expect(start(list)).resolves.toBeUndefined();

      expect(calls.filter((prefix) => list.includes(prefix)).sort()).toEqual([...list].sort());
    },
    TIMEOUT,
  );

  it(
    'completes for no folders',
    async () => {
      await expect(start([])).resolves.toBeUndefined();
    },
    TIMEOUT,
  );

  it(
    'a refused folder stops neither its batch nor the later ones, then fails with the count only',
    async () => {
      const list = prefixes(25, randomUUID());
      const bad = list[3] ?? '';
      refused.add(bad);

      const failure = await start(list).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(calls.filter((prefix) => list.includes(prefix)).sort()).toEqual([...list].sort());
      expect(failure).toBeInstanceOf(WorkflowFailedError);
      const cause = (failure as WorkflowFailedError).cause;
      expect(cause).toBeInstanceOf(ApplicationFailure);
      const application = cause as ApplicationFailure;
      expect(application.type).toBe('FoldersNotDeleted');
      expect(application.nonRetryable).toBe(true);
      expect(application.message).toBe('1 of 25 folders were not deleted');
      expect(application.message).not.toContain('keep/');
    },
    TIMEOUT,
  );

  it(
    'counts every refused folder across batches',
    async () => {
      const list = prefixes(45, randomUUID());
      for (const index of [0, 19, 20, 44]) {
        refused.add(list[index] ?? '');
      }

      const failure = await start(list).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(calls.filter((prefix) => list.includes(prefix))).toHaveLength(45);
      const application = (failure as WorkflowFailedError).cause as ApplicationFailure;
      expect(application.type).toBe('FoldersNotDeleted');
      expect(application.message).toBe('4 of 45 folders were not deleted');
    },
    TIMEOUT,
  );

  it(
    'a cancelled workflow ends as cancelled, not as undeleted folders, and starts no later batch',
    async () => {
      const list = prefixes(45, randomUUID());
      for (const prefix of list) {
        hung.add(prefix);
      }

      const handle = await client.workflow.start('deleteFiles', {
        ...options(),
        args: [{ prefixes: list }],
      });
      await vi.waitFor(
        () => {
          expect(calls.filter((prefix) => list.includes(prefix)).length).toBeGreaterThan(0);
        },
        { timeout: 20_000 },
      );
      await handle.cancel();

      const failure = await handle.result().then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(WorkflowFailedError);
      const cause = (failure as WorkflowFailedError).cause;
      expect(cause).toBeInstanceOf(CancelledFailure);
      expect(cause).not.toBeInstanceOf(ApplicationFailure);
      const secondBatch = list.slice(20);
      expect(calls.filter((prefix) => secondBatch.includes(prefix))).toEqual([]);
    },
    TIMEOUT,
  );
});
