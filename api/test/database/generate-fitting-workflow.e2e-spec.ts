import { randomUUID } from 'node:crypto';

import { ApplicationFailure, Context } from '@temporalio/activity';
import {
  CancelledFailure,
  Client,
  Connection,
  WorkflowFailedError,
  type WorkflowHandle,
} from '@temporalio/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  FittingOutcome,
  GenerateOutcome,
} from '../../src/temporal/activities/fitting.activities.js';
import { fittingWorkflowId } from '../../src/temporal/fitting-workflow-id.js';
import {
  startTestWorkerWith,
  testTemporalSettings,
  type TestWorker,
} from '../support/test-temporal.js';

const settings = testTemporalSettings();
const TIMEOUT = 40_000;
// A cancel reaches an activity at its next heartbeat, up to 24 s with a 30 s heartbeat timeout.
const CANCEL_TIMEOUT = 90_000;

// What one generation's stub steps do; a step with no entry answers the success.
interface Script {
  markProcessing?: () => { userId: string } | null | Promise<{ userId: string } | null>;
  generate?: () => Promise<GenerateOutcome> | GenerateOutcome;
  moderate?: () => { flagged: boolean };
  discardResult?: () => void;
  complete?: () => void;
}

interface Call {
  step: string;
  generationId: string;
  args: unknown[];
}

function failure(type: string, message: string, requestId: string | null = null) {
  return ApplicationFailure.create({
    message,
    type,
    nonRetryable: true,
    details: [requestId],
  });
}

// The workflow runs on the real throwaway Temporal with stub activities: its own logic (which
// failure becomes which code, retries, cancellation) is checked apart from the database and the
// storage; the real activities have their own spec (fitting-activities.e2e-spec.ts).
describe('generateFitting workflow (spec 0019 plan §4, A67, A68)', () => {
  const scripts = new Map<string, Script>();
  const calls: Call[] = [];
  const USER = randomUUID();
  let releaseHung: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    releaseHung = resolve;
  });
  let client: Client;
  let connection: Connection | undefined;
  let worker: TestWorker | undefined;

  function record(step: string, generationId: string, ...args: unknown[]): Script {
    calls.push({ step, generationId, args });
    return scripts.get(generationId) ?? {};
  }

  beforeAll(async () => {
    worker = await startTestWorkerWith(settings, {
      async markProcessing(generationId: string) {
        const script = record('markProcessing', generationId);
        return script.markProcessing === undefined ? { userId: USER } : script.markProcessing();
      },
      async generate(generationId: string, timeoutSeconds: number) {
        const script = record('generate', generationId, timeoutSeconds);
        return script.generate === undefined
          ? ({ ok: true, requestId: 'req_ok' } satisfies GenerateOutcome)
          : script.generate();
      },
      async moderate(generationId: string) {
        const script = record('moderate', generationId);
        return script.moderate === undefined ? { flagged: false } : script.moderate();
      },
      async discardResult(generationId: string, userId: string) {
        record('discardResult', generationId, userId).discardResult?.();
      },
      async complete(generationId: string, outcome: FittingOutcome) {
        record('complete', generationId, outcome).complete?.();
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

  function stepsOf(generationId: string): string[] {
    return calls.filter((call) => call.generationId === generationId).map((call) => call.step);
  }

  function callsOf(generationId: string, step: string): Call[] {
    return calls.filter((call) => call.generationId === generationId && call.step === step);
  }

  function outcomeOf(generationId: string): unknown {
    return callsOf(generationId, 'complete').at(-1)?.args[0];
  }

  function start(generationId: string, script: Script = {}): Promise<WorkflowHandle> {
    scripts.set(generationId, script);
    return client.workflow.start('generateFitting', {
      taskQueue: settings.taskQueue,
      workflowId: fittingWorkflowId(generationId),
      workflowExecutionTimeout: '120 seconds',
      args: [{ generationId, timeoutSeconds: 30 }],
    });
  }

  async function run(script: Script = {}): Promise<string> {
    const generationId = randomUUID();
    await (await start(generationId, script)).result();
    return generationId;
  }

  it(
    'completes a fitting: moderated result, no discard, the request id kept',
    async () => {
      const id = await run();

      expect(stepsOf(id)).toEqual(['markProcessing', 'generate', 'moderate', 'complete']);
      expect(outcomeOf(id)).toEqual({ status: 'completed', providerRequestId: 'req_ok' });
      expect(callsOf(id, 'moderate')[0]?.args).toEqual([]);
      expect(callsOf(id, 'generate')[0]?.args).toEqual([30]);
    },
    TIMEOUT,
  );

  it(
    'ends a failed generate as provider_error with the request id from the details',
    async () => {
      const id = await run({
        generate: () => {
          throw failure('provider_error', 'OpenAI edit_image: http 500', 'req_9');
        },
      });

      expect(stepsOf(id)).toEqual(['markProcessing', 'generate', 'complete', 'discardResult']);
      expect(callsOf(id, 'discardResult')[0]?.args).toEqual([USER]);
      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'OpenAI edit_image: http 500',
        providerRequestId: 'req_9',
      });
    },
    TIMEOUT,
  );

  it(
    'ends a timed out generate as model_timeout',
    async () => {
      const id = await run({
        generate: () => {
          throw failure('model_timeout', 'OpenAI edit_image: timeout');
        },
      });

      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'model_timeout',
        errorMessage: 'OpenAI edit_image: timeout',
        providerRequestId: null,
      });
      expect(stepsOf(id)).toContain('discardResult');
    },
    TIMEOUT,
  );

  it(
    "ends the model's refusal as moderation with no message, skips moderate and discards",
    async () => {
      const id = await run({
        generate: () => ({ ok: false, failureCode: 'moderation', requestId: 'req_r' }),
      });

      expect(stepsOf(id)).toEqual(['markProcessing', 'generate', 'complete', 'discardResult']);
      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'moderation',
        errorMessage: null,
        providerRequestId: 'req_r',
      });
    },
    TIMEOUT,
  );

  it(
    'ends a flagged result as moderation, discards it and keeps the request id',
    async () => {
      const id = await run({ moderate: () => ({ flagged: true }) });

      expect(stepsOf(id)).toEqual([
        'markProcessing',
        'generate',
        'moderate',
        'complete',
        'discardResult',
      ]);
      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'moderation',
        errorMessage: null,
        providerRequestId: 'req_ok',
      });
    },
    TIMEOUT,
  );

  it(
    'attempts generate once even when it throws a retryable error (A67), naming the kind only',
    async () => {
      const id = await run({
        generate: () => {
          throw new TypeError('keep/users/secret');
        },
      });

      expect(callsOf(id, 'generate')).toHaveLength(1);
      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'TypeError',
        providerRequestId: null,
      });
    },
    TIMEOUT,
  );

  it(
    'retries moderate after a transient error and then completes',
    async () => {
      let attempts = 0;
      const id = await run({
        moderate: () => {
          attempts += 1;
          if (attempts === 1) throw new Error('network');
          return { flagged: false };
        },
      });

      expect(callsOf(id, 'moderate')).toHaveLength(2);
      expect(outcomeOf(id)).toEqual({ status: 'completed', providerRequestId: 'req_ok' });
      expect(stepsOf(id)).not.toContain('discardResult');
    },
    TIMEOUT,
  );

  it(
    'ends as provider_error after three failed attempts of moderate',
    async () => {
      const id = await run({
        moderate: () => {
          throw new Error('network');
        },
      });

      expect(callsOf(id, 'moderate')).toHaveLength(3);
      expect(outcomeOf(id)).toMatchObject({
        status: 'failed',
        failureCode: 'provider_error',
        providerRequestId: 'req_ok',
      });
      expect(stepsOf(id)).toContain('discardResult');
    },
    TIMEOUT,
  );

  it(
    'does not retry a moderate that fails for good',
    async () => {
      const id = await run({
        moderate: () => {
          throw failure('provider_error', 'OpenAI moderate: http 400', 'req_m');
        },
      });

      expect(callsOf(id, 'moderate')).toHaveLength(1);
      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'OpenAI moderate: http 400',
        // The paid call's id wins over a later failure's own.
        providerRequestId: 'req_ok',
      });
    },
    TIMEOUT,
  );

  it(
    'retries markProcessing and complete until they succeed',
    async () => {
      let marks = 0;
      let completes = 0;
      const id = await run({
        markProcessing: () => {
          marks += 1;
          if (marks === 1) throw new Error('database down');
          return { userId: USER };
        },
        complete: () => {
          completes += 1;
          if (completes === 1) throw new Error('database down');
        },
      });

      expect(callsOf(id, 'markProcessing')).toHaveLength(2);
      expect(callsOf(id, 'complete')).toHaveLength(2);
      expect(callsOf(id, 'generate')).toHaveLength(1);
    },
    TIMEOUT,
  );

  it(
    'ends the row first and retries the discard of a result until the storage answers',
    async () => {
      let discards = 0;
      const id = await run({
        moderate: () => ({ flagged: true }),
        discardResult: () => {
          discards += 1;
          if (discards <= 2) throw new Error('storage down');
        },
      });

      expect(stepsOf(id)).toEqual([
        'markProcessing',
        'generate',
        'moderate',
        'complete',
        'discardResult',
        'discardResult',
        'discardResult',
      ]);
      expect(callsOf(id, 'complete')).toHaveLength(1);
      expect(outcomeOf(id)).toMatchObject({ status: 'failed', failureCode: 'moderation' });
    },
    TIMEOUT,
  );

  it(
    'keeps retrying a discard that never succeeds, after the row has ended',
    async () => {
      const id = randomUUID();
      const handle = await start(id, {
        generate: () => {
          throw failure('provider_error', 'boom');
        },
        discardResult: () => {
          throw new Error('storage down');
        },
      });

      await vi.waitFor(
        () => expect(callsOf(id, 'discardResult').length).toBeGreaterThanOrEqual(2),
        {
          timeout: 30_000,
        },
      );

      expect(callsOf(id, 'complete')).toHaveLength(1);
      expect((await handle.describe()).status.name).toBe('RUNNING');
      await handle.terminate('the test is over');
    },
    TIMEOUT,
  );

  it(
    'stops at once when markProcessing finds the row gone or ended',
    async () => {
      const id = await run({ markProcessing: () => null });

      expect(stepsOf(id)).toEqual(['markProcessing']);
    },
    TIMEOUT,
  );

  it(
    "keeps the paid call's request id when a later step fails without naming one",
    async () => {
      const id = await run({
        moderate: () => {
          throw failure('Boom', 'boom');
        },
      });

      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'Boom',
        providerRequestId: 'req_ok',
      });
    },
    TIMEOUT,
  );

  it(
    'treats an activity that ends cancelled, with no cancel of the workflow, as provider_error and not spent',
    async () => {
      const id = await run({
        generate: () => {
          throw new CancelledFailure('the worker is shutting down');
        },
      });

      const outcome = outcomeOf(id) as FittingOutcome;
      expect(outcome).toMatchObject({ status: 'failed', failureCode: 'provider_error' });
      expect(outcome).not.toHaveProperty('keepUnit');
      expect(stepsOf(id)).toContain('discardResult');
    },
    TIMEOUT,
  );

  it('ends a generate that passes its time limit as model_timeout', async () => {
    const id = randomUUID();
    scripts.set(id, {
      generate: async () => {
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
        return { ok: true, requestId: null };
      },
    });

    // timeoutSeconds 0: the limit is the 60 s overhead alone.
    await client.workflow.execute('generateFitting', {
      taskQueue: settings.taskQueue,
      workflowId: fittingWorkflowId(id),
      workflowExecutionTimeout: '110 seconds',
      args: [{ generationId: id, timeoutSeconds: 0 }],
    });

    expect(outcomeOf(id)).toMatchObject({
      status: 'failed',
      failureCode: 'model_timeout',
      errorMessage: 'TimeoutFailure: START_TO_CLOSE',
    });
    expect(callsOf(id, 'generate')).toHaveLength(1);
  }, 120_000);

  it(
    'ends as cancelled with nothing to discard when cancelled during markProcessing',
    async () => {
      const id = randomUUID();
      const handle = await start(id, {
        markProcessing: async () => {
          await released;
          return { userId: USER };
        },
      });
      await vi.waitFor(() => expect(callsOf(id, 'markProcessing')).toHaveLength(1), {
        timeout: 20_000,
      });

      await handle.cancel();
      const error = await handle.result().then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect((error as WorkflowFailedError).cause).toBeInstanceOf(CancelledFailure);
      expect((await handle.describe()).status.name).toBe('CANCELLED');
      expect(stepsOf(id)).toEqual(['markProcessing', 'complete']);
      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'cancelled',
        providerRequestId: null,
        keepUnit: true,
      });
    },
    CANCEL_TIMEOUT,
  );

  it(
    'discards the result and ends the row with its unit kept when cancelled, ending as cancelled',
    async () => {
      const id = randomUUID();
      const handle = await start(id, {
        generate: async () => {
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
          // As the real activity: the cancellation's own failure.
          throw context.cancellationSignal.reason;
        },
      });
      await vi.waitFor(() => expect(callsOf(id, 'generate')).toHaveLength(1), { timeout: 20_000 });

      await handle.cancel();
      const error = await handle.result().then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(WorkflowFailedError);
      expect((error as WorkflowFailedError).cause).toBeInstanceOf(CancelledFailure);
      expect((await handle.describe()).status.name).toBe('CANCELLED');
      expect(stepsOf(id)).toEqual(['markProcessing', 'generate', 'complete', 'discardResult']);
      expect(callsOf(id, 'discardResult')[0]?.args).toEqual([USER]);
      expect(outcomeOf(id)).toEqual({
        status: 'failed',
        failureCode: 'provider_error',
        errorMessage: 'cancelled',
        providerRequestId: null,
        keepUnit: true,
      });
    },
    CANCEL_TIMEOUT,
  );
});
