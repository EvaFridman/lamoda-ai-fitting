import { afterEach, describe, expect, it, vi } from 'vitest';

import { abortKind, sleep, withDeadline } from './deadline.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('withDeadline', () => {
  it('aborts with a TimeoutError once the time has passed', async () => {
    const signal = withDeadline(10);

    // A loaded machine (CI) may fire a 10 ms timer late; the wait only has to outlast it.
    await vi.waitFor(() => expect(signal.aborted).toBe(true), { timeout: 5000 });
    expect(abortKind(signal.reason)).toBe('timeout');
  });

  it('joins the caller signal and keeps its reason', () => {
    const caller = new AbortController();
    const signal = withDeadline(60_000, caller.signal);
    expect(signal.aborted).toBe(false);

    caller.abort(new DOMException('cancelled', 'AbortError'));

    expect(signal.aborted).toBe(true);
    expect(abortKind(signal.reason)).toBe('aborted');
  });

  it('is aborted at once by an already aborted caller signal', () => {
    const caller = new AbortController();
    caller.abort();

    expect(withDeadline(60_000, caller.signal).aborted).toBe(true);
  });
});

describe('abortKind', () => {
  it('tells a timeout from a cancellation and from any other error', () => {
    expect(abortKind(new DOMException('t', 'TimeoutError'))).toBe('timeout');
    expect(abortKind(new DOMException('a', 'AbortError'))).toBe('aborted');
    expect(abortKind(new TypeError('fetch failed'))).toBeNull();
    expect(abortKind('TimeoutError')).toBeNull();
    expect(abortKind(null)).toBeNull();
  });

  function cancelled() {
    const error = new Error('activity cancelled');
    error.name = 'CancelledFailure';
    return error;
  }

  it('takes the kind from the reason of an aborted signal, not from the error', () => {
    const timedOut = new AbortController();
    timedOut.abort(new DOMException('t', 'TimeoutError'));
    const withCancel = new AbortController();
    withCancel.abort(cancelled());
    const withPlain = new AbortController();
    withPlain.abort(new Error('x'));
    const withString = new AbortController();
    withString.abort('stop');

    expect(abortKind(new TypeError('fetch failed'), timedOut.signal)).toBe('timeout');
    expect(abortKind(new DOMException('a', 'AbortError'), timedOut.signal)).toBe('timeout');
    expect(abortKind(cancelled(), withCancel.signal)).toBe('aborted');
    expect(abortKind(new DOMException('t', 'TimeoutError'), withCancel.signal)).toBe('aborted');
    expect(abortKind(new TypeError('fetch failed'), withPlain.signal)).toBe('aborted');
    expect(abortKind(undefined, withString.signal)).toBe('aborted');
  });

  it('uses the rules by error name without a signal or with one not aborted', () => {
    const open = new AbortController().signal;

    expect(abortKind(new DOMException('t', 'TimeoutError'), open)).toBe('timeout');
    expect(abortKind(new DOMException('a', 'AbortError'), open)).toBe('aborted');
    expect(abortKind(cancelled(), open)).toBeNull();
    expect(abortKind(cancelled())).toBeNull();
    expect(abortKind(new TypeError('fetch failed'), open)).toBeNull();
  });

  it('is a timeout for the signal of withDeadline once the time has passed', async () => {
    const signal = withDeadline(10, new AbortController().signal);

    await vi.waitFor(() => expect(signal.aborted).toBe(true), { timeout: 5000 });

    expect(abortKind(new TypeError('x'), signal)).toBe('timeout');
  });
});

describe('sleep', () => {
  it('resolves after the time', async () => {
    vi.useFakeTimers();
    let done = false;
    const promise = sleep(100).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(done).toBe(true);
  });

  it('rejects with the signal reason as soon as it aborts, and clears its timer', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new DOMException('stop', 'AbortError');
    const promise = sleep(10_000, controller.signal);
    const assertion = expect(promise).rejects.toBe(reason);

    controller.abort(reason);

    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects at once for an already aborted signal, without a timer', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(10_000, controller.signal)).rejects.toBe(controller.signal.reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes its listener when the time passes first', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const promise = sleep(5, controller.signal);

    await vi.advanceTimersByTimeAsync(5);
    await promise;

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
