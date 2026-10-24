import type { Client, Connection } from '@temporalio/client';
import { ServiceError, WorkflowNotFoundError } from '@temporalio/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { START_TIMEOUT_MS, WorkflowStarter } from './workflow-starter.js';

const UNAVAILABLE = 14;
const INVALID_ARGUMENT = 3;

function grpcError(code: number): Error {
  return Object.assign(new Error('grpc'), { code, details: 'grpc', metadata: {} });
}

function serviceError(code: number): ServiceError {
  return new ServiceError('Failed to start workflow', { cause: grpcError(code) });
}

function setup() {
  const start = vi.fn<(type: string, options: Record<string, unknown>) => Promise<unknown>>();
  const cancel = vi.fn<() => Promise<void>>();
  const getHandle = vi.fn((_workflowId: string) => ({ cancel }));
  const withAbortSignal = vi.fn((_signal: AbortSignal, call: () => Promise<unknown>) => call());
  const starter = new WorkflowStarter(
    { workflow: { start, getHandle } } as unknown as Client,
    { withAbortSignal } as unknown as Connection,
    { address: 'a:1', namespace: 'default', taskQueue: 'queue-1' },
  );
  return { starter, start, withAbortSignal, cancel, getHandle };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorkflowStarter.start', () => {
  it('starts on the settings task queue and reuses a running workflow id', async () => {
    const { starter, start } = setup();
    start.mockResolvedValue({});

    await starter.start('deleteFiles', { workflowId: 'w-1', args: [{ prefixes: ['a/'] }] });

    expect(start).toHaveBeenCalledExactlyOnceWith('deleteFiles', {
      workflowId: 'w-1',
      args: [{ prefixes: ['a/'] }],
      taskQueue: 'queue-1',
      workflowIdConflictPolicy: 'USE_EXISTING',
    });
  });

  it('runs the call under an abort signal and the bound is 5 s', async () => {
    const { starter, start, withAbortSignal } = setup();
    start.mockResolvedValue({});

    await starter.start('deleteFiles', { workflowId: 'w-1' });

    expect(START_TIMEOUT_MS).toBe(5000);
    expect(withAbortSignal).toHaveBeenCalledOnce();
    expect(withAbortSignal.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it('retries a retryable gRPC error and succeeds on a later attempt', async () => {
    const { starter, start } = setup();
    start
      .mockRejectedValueOnce(serviceError(UNAVAILABLE))
      .mockRejectedValueOnce(grpcError(UNAVAILABLE))
      .mockResolvedValue({});

    await expect(starter.start('deleteFiles', { workflowId: 'w-1' })).resolves.toBeUndefined();

    expect(start).toHaveBeenCalledTimes(3);
  });

  it('does not retry an error a retry cannot fix', async () => {
    const { starter, start } = setup();
    const failure = serviceError(INVALID_ARGUMENT);
    start.mockRejectedValue(failure);

    await expect(starter.start('deleteFiles', { workflowId: 'w-1' })).rejects.toBe(failure);

    expect(start).toHaveBeenCalledOnce();
  });

  it('does not retry an error that is not from gRPC', async () => {
    const { starter, start } = setup();
    const failure = new Error('boom');
    start.mockRejectedValue(failure);

    await expect(starter.start('deleteFiles', { workflowId: 'w-1' })).rejects.toBe(failure);

    expect(start).toHaveBeenCalledOnce();
  });

  // Only the bound's own timer is faked; the wait between attempts (node:timers/promises) is real.
  describe('with the bound driven by fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('gives up while waiting between attempts and throws the last failure, not the abort', async () => {
      const { starter, start, withAbortSignal } = setup();
      const last = serviceError(UNAVAILABLE);
      start.mockRejectedValue(last);
      const outcome = starter.start('deleteFiles', { workflowId: 'w-1' }).catch((e: unknown) => e);
      await vi.waitFor(() => expect(start).toHaveBeenCalled());

      await vi.advanceTimersByTimeAsync(START_TIMEOUT_MS);
      const error = await outcome;

      expect(error).toBe(last);
      expect((error as Error).name).not.toBe('AbortError');
      expect(withAbortSignal.mock.calls[0]?.[0].aborted).toBe(true);
    });

    it('gives up on a call that never answers and throws the failure it ended with', async () => {
      const { starter, start, withAbortSignal } = setup();
      const last = serviceError(UNAVAILABLE);
      start.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            withAbortSignal.mock.calls[0]?.[0].addEventListener('abort', () => reject(last));
          }),
      );
      const outcome = starter.start('deleteFiles', { workflowId: 'w-1' }).catch((e: unknown) => e);
      await vi.waitFor(() => expect(start).toHaveBeenCalled());

      await vi.advanceTimersByTimeAsync(START_TIMEOUT_MS - 1);
      expect(start).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);

      await expect(outcome).resolves.toBe(last);
      expect(start).toHaveBeenCalledOnce();
    });

    it('clears the timer after a successful start, so nothing aborts later', async () => {
      const { starter, start, withAbortSignal } = setup();
      start.mockResolvedValue({});

      await starter.start('deleteFiles', { workflowId: 'w-1' });
      const signal = withAbortSignal.mock.calls[0]?.[0];
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(START_TIMEOUT_MS * 2);

      expect(signal?.aborted).toBe(false);
    });

    it('clears the timer after a failed start', async () => {
      const { starter, start } = setup();
      start.mockRejectedValue(new Error('boom'));

      await expect(starter.start('deleteFiles', { workflowId: 'w-1' })).rejects.toThrow('boom');

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe('WorkflowStarter.cancel', () => {
  it('asks the workflow of that id to cancel', async () => {
    const { starter, cancel, getHandle } = setup();
    cancel.mockResolvedValue();

    await expect(starter.cancel('fitting-1')).resolves.toBeUndefined();

    expect(getHandle).toHaveBeenCalledExactlyOnceWith('fitting-1');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('runs the call under the abort signal', async () => {
    const { starter, cancel, withAbortSignal } = setup();
    cancel.mockResolvedValue();

    await starter.cancel('fitting-1');

    expect(withAbortSignal).toHaveBeenCalledOnce();
    expect(withAbortSignal.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
  });

  it('is not an error when the workflow is gone or already ended', async () => {
    const { starter, cancel } = setup();
    cancel.mockRejectedValue(new WorkflowNotFoundError('not found', 'fitting-1', undefined));

    await expect(starter.cancel('fitting-1')).resolves.toBeUndefined();

    expect(cancel).toHaveBeenCalledOnce();
  });

  it('retries a retryable gRPC error and succeeds on a later attempt', async () => {
    const { starter, cancel } = setup();
    cancel
      .mockRejectedValueOnce(serviceError(UNAVAILABLE))
      .mockRejectedValueOnce(grpcError(UNAVAILABLE))
      .mockResolvedValue();

    await expect(starter.cancel('fitting-1')).resolves.toBeUndefined();

    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it('does not retry an error a retry cannot fix', async () => {
    const { starter, cancel } = setup();
    const failure = serviceError(INVALID_ARGUMENT);
    cancel.mockRejectedValue(failure);

    await expect(starter.cancel('fitting-1')).rejects.toBe(failure);

    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects at once once the starter is closing, without calling the client', async () => {
    const { starter, cancel, getHandle } = setup();
    await starter.drain();

    await expect(starter.cancel('fitting-1')).rejects.toThrow(/closing/);

    expect(getHandle).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('is waited for by drain', async () => {
    const { starter, cancel } = setup();
    let finish: () => void = () => {};
    cancel.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const running = starter.cancel('fitting-1');

    let drained = false;
    const draining = starter.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(drained).toBe(false);

    finish();
    await running;
    await draining;

    expect(drained).toBe(true);
  });
});

describe('WorkflowStarter.drain', () => {
  it('waits for a start in progress, then refuses new starts without calling the client', async () => {
    const { starter, start } = setup();
    let finish: (value: unknown) => void = () => {};
    start.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const running = starter.start('deleteFiles', { workflowId: 'w-1' });

    let drained = false;
    const draining = starter.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(drained).toBe(false);

    finish({});
    await running;
    await draining;

    expect(drained).toBe(true);
    await expect(starter.start('deleteFiles', { workflowId: 'w-2' })).rejects.toThrow(/closing/);
    expect(start).toHaveBeenCalledOnce();
  });

  it('settles even when the start in progress fails', async () => {
    const { starter, start } = setup();
    start.mockRejectedValue(serviceError(INVALID_ARGUMENT));
    const running = starter.start('deleteFiles', { workflowId: 'w-1' });
    const handled = running.catch(() => undefined);

    await expect(starter.drain()).resolves.toBeUndefined();
    await handled;
  });
});
