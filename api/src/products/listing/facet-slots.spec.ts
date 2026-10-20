import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppException } from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import { FacetQuerySlots } from './facet-slots.js';

const CONNECTION_TIMEOUT_MS = 2000;

function slotsFor(poolMax: number): FacetQuerySlots {
  const values: Record<string, number> = {
    DATABASE_POOL_MAX: poolMax,
    DATABASE_CONNECTION_TIMEOUT_MS: CONNECTION_TIMEOUT_MS,
  };
  return new FacetQuerySlots({ get: (name: string) => values[name] } as unknown as ConfigService<
    Env,
    true
  >);
}

// A query that stays open until finish() and records when it started.
function controlled(started: string[], name: string) {
  let finish: (value?: string) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const query = () => {
    started.push(name);
    return new Promise<string>((resolve, reject) => {
      finish = () => resolve(name);
      fail = reject;
    });
  };
  return { query, finish: () => finish(), fail: (error: Error) => fail(error) };
}

describe('FacetQuerySlots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Counts how many queries run at once when `count` are offered.
  async function peakConcurrency(poolMax: number, count: number): Promise<number> {
    const slots = slotsFor(poolMax);
    let running = 0;
    let peak = 0;
    const runs = Array.from({ length: count }, () =>
      slots.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 10));
        running -= 1;
      }),
    );
    await vi.advanceTimersByTimeAsync(10 * count);
    await Promise.all(runs);
    return peak;
  }

  it.each([
    [10, 5],
    [1, 1],
    [3, 1],
    [50, 25],
  ])('with a pool of %i runs at most %i queries at once', async (poolMax, size) => {
    expect(await peakConcurrency(poolMax, size * 3)).toBe(size);
  });

  it('answers the result of the query', async () => {
    await expect(slotsFor(2).run(() => Promise.resolve('rows'))).resolves.toBe('rows');
  });

  it('hands a freed slot to the waiters in the order they came', async () => {
    const slots = slotsFor(2);
    const started: string[] = [];
    const first = controlled(started, 'first');
    const second = controlled(started, 'second');
    const third = controlled(started, 'third');

    const runs = [first, second, third].map((item) => slots.run(item.query));
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['first']);

    first.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['first', 'second']);

    second.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['first', 'second', 'third']);

    third.finish();
    await expect(Promise.all(runs)).resolves.toEqual(['first', 'second', 'third']);
  });

  it('refuses a waiter with a 503 after the connection timeout, without running its query', async () => {
    const slots = slotsFor(2);
    const holder = controlled([], 'holder');
    const started: string[] = [];
    const held = slots.run(holder.query);
    const waiter = slots.run(controlled(started, 'waiter').query);
    const refusal = waiter.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS);

    const error = await refusal;
    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Too many filter counts at once, try again later',
    });
    expect((error as AppException).getStatus()).toBe(503);
    expect(started).toEqual([]);
    holder.finish();
    await held;
  });

  it('keeps a waiter waiting just under the connection timeout', async () => {
    const slots = slotsFor(2);
    const holder = controlled([], 'holder');
    const held = slots.run(holder.query);
    const started: string[] = [];
    const waiting = controlled(started, 'waiter');
    const waiter = slots.run(waiting.query);

    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS - 1);
    holder.finish();
    await held;
    await vi.advanceTimersByTimeAsync(0);

    expect(started).toEqual(['waiter']);
    waiting.finish();
    await expect(waiter).resolves.toBe('waiter');
  });

  it('removes a refused waiter from the queue: a later release passes the slot to the next one', async () => {
    const slots = slotsFor(2);
    const holder = controlled([], 'holder');
    const held = slots.run(holder.query);
    const started: string[] = [];
    const refused = slots.run(controlled(started, 'refused').query).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS / 2);
    const late = controlled(started, 'late');
    const lateRun = slots.run(late.query);
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS / 2);
    await refused;

    holder.finish();
    await held;
    await vi.advanceTimersByTimeAsync(0);

    expect(started).toEqual(['late']);
    late.finish();
    await expect(lateRun).resolves.toBe('late');
  });

  it('counts its slots right after a refusal: the size is neither exceeded nor lost', async () => {
    const slots = slotsFor(2);
    const holder = controlled([], 'holder');
    const held = slots.run(holder.query);
    const refused = slots.run(() => Promise.resolve('never')).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS);
    await refused;
    holder.finish();
    await held;

    const started: string[] = [];
    const next = controlled(started, 'next');
    const another = controlled(started, 'another');
    const runs = [slots.run(next.query), slots.run(another.query)];
    await vi.advanceTimersByTimeAsync(0);

    expect(started).toEqual(['next']);
    next.finish();
    await vi.advanceTimersByTimeAsync(0);
    another.finish();
    await Promise.all(runs);
  });

  it('releases the slot of a query that throws, and passes the error on', async () => {
    const slots = slotsFor(2);
    const failing = controlled([], 'failing');
    const failed = slots.run(failing.query).catch((error: unknown) => error);
    const started: string[] = [];
    const next = controlled(started, 'next');
    const nextRun = slots.run(next.query);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([]);

    const boom = new Error('boom');
    failing.fail(boom);

    expect(await failed).toBe(boom);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['next']);
    next.finish();
    await nextRun;
  });

  describe('with an AbortSignal', () => {
    it('throws the reason of a signal already aborted, without taking a slot or running the query', async () => {
      const slots = slotsFor(2);
      const reason = new Error('request failed');
      const query = vi.fn(() => Promise.resolve('never'));

      await expect(slots.run(query, AbortSignal.abort(reason))).rejects.toBe(reason);

      expect(query).not.toHaveBeenCalled();
      const started: string[] = [];
      const next = controlled(started, 'next');
      const nextRun = slots.run(next.query);
      await vi.advanceTimersByTimeAsync(0);
      expect(started).toEqual(['next']);
      next.finish();
      await nextRun;
    });

    it('drops a waiter at once when its signal aborts: rejected with the reason, query never run, timer cleared', async () => {
      const slots = slotsFor(2);
      const holder = controlled([], 'holder');
      const held = slots.run(holder.query);
      const controller = new AbortController();
      const query = vi.fn(() => Promise.resolve('never'));
      const dropped = slots.run(query, controller.signal).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10);

      const reason = new Error('another query failed');
      controller.abort(reason);

      expect(await dropped).toBe(reason);
      expect(vi.getTimerCount()).toBe(0);
      holder.finish();
      await held;
      await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS);
      expect(query).not.toHaveBeenCalled();
    });

    it('passes the next release to the next waiter after an abort, and keeps the slot count right', async () => {
      const slots = slotsFor(2);
      const holder = controlled([], 'holder');
      const held = slots.run(holder.query);
      const controller = new AbortController();
      const dropped = slots
        .run(() => Promise.resolve('never'), controller.signal)
        .catch((error: unknown) => error);
      const started: string[] = [];
      const next = controlled(started, 'next');
      const nextRun = slots.run(next.query);
      controller.abort(new Error('stop'));
      await dropped;

      holder.finish();
      await held;
      await vi.advanceTimersByTimeAsync(0);

      expect(started).toEqual(['next']);
      const extra = controlled(started, 'extra');
      const extraRun = slots.run(extra.query);
      await vi.advanceTimersByTimeAsync(0);
      expect(started).toEqual(['next']);
      next.finish();
      await nextRun;
      await vi.advanceTimersByTimeAsync(0);
      expect(started).toEqual(['next', 'extra']);
      extra.finish();
      await extraRun;
    });

    it('does nothing to a waiter that got its slot when the signal aborts later', async () => {
      const slots = slotsFor(2);
      const holder = controlled([], 'holder');
      const held = slots.run(holder.query);
      const controller = new AbortController();
      const running = controlled([], 'running');
      const run = slots.run(running.query, controller.signal);
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
      await vi.advanceTimersByTimeAsync(0);

      holder.finish();
      await held;
      await vi.advanceTimersByTimeAsync(0);
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
      controller.abort(new Error('late'));
      running.finish();

      await expect(run).resolves.toBe('running');
    });

    it('gives the slot back, without running the query, when the signal aborts right after the slot was handed over', async () => {
      const slots = slotsFor(2);
      const holder = controlled([], 'holder');
      const held = slots.run(holder.query);
      const controller = new AbortController();
      const reason = new Error('aborted between hand-over and start');
      const query = vi.fn(() => Promise.resolve('never'));
      const waiter = slots.run(query, controller.signal).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      // The hand-over removes the waiter's abort listener: abort in that very call, so the waiter's
      // continuation has not run yet.
      const removeListener = controller.signal.removeEventListener.bind(controller.signal);
      vi.spyOn(controller.signal, 'removeEventListener').mockImplementation((...args) => {
        removeListener(...args);
        controller.abort(reason);
      });

      holder.finish();
      await held;

      expect(await waiter).toBe(reason);
      expect(query).not.toHaveBeenCalled();
      const started: string[] = [];
      const next = controlled(started, 'next');
      const nextRun = slots.run(next.query);
      await vi.advanceTimersByTimeAsync(0);
      expect(started).toEqual(['next']);
      next.finish();
      await nextRun;
    });

    it('does not stop a query that is already running when its signal aborts', async () => {
      const slots = slotsFor(2);
      const controller = new AbortController();
      const running = controlled([], 'running');
      const run = slots.run(running.query, controller.signal);
      await vi.advanceTimersByTimeAsync(0);

      controller.abort(new Error('late'));
      running.finish();

      await expect(run).resolves.toBe('running');
    });
  });

  it('releases the slot of a query that throws at once', async () => {
    const slots = slotsFor(2);

    await expect(
      slots.run(() => {
        throw new Error('sync boom');
      }),
    ).rejects.toThrow('sync boom');

    await expect(slots.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});
