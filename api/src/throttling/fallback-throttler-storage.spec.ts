import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FallbackThrottlerStorage, REDIS_RETRY_AFTER_MS } from './fallback-throttler-storage.js';

const sharedIncrement = vi.hoisted(() => vi.fn());

// The Redis-backed storage is replaced by a stub whose command can fail the way ioredis does.
vi.mock('@nest-lab/throttler-storage-redis', () => ({
  ThrottlerStorageRedisService: class {
    increment = sharedIncrement;
  },
}));

const RECORD = { totalHits: 7, timeToExpire: 1, isBlocked: false, timeToBlockExpire: 0 };

describe('FallbackThrottlerStorage', () => {
  let storage: FallbackThrottlerStorage;
  let redis: { status: string };

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    sharedIncrement.mockReset();
    redis = { status: 'ready' };
    storage = new FallbackThrottlerStorage(redis as unknown as Redis);
  });

  afterEach(() => {
    storage.onApplicationShutdown();
    vi.restoreAllMocks();
  });

  it('returns the shared record while Redis answers', async () => {
    sharedIncrement.mockResolvedValue(RECORD);

    await expect(storage.increment('k', 1000, 10, 0, 'read-burst')).resolves.toBe(RECORD);
  });

  it('counts in memory when a Redis command times out (ioredis "Command timed out")', async () => {
    sharedIncrement.mockRejectedValue(new Error('Command timed out'));

    const first = await storage.increment('k', 60_000, 10, 0, 'read-minute');
    const second = await storage.increment('k', 60_000, 10, 0, 'read-minute');

    expect([first.totalHits, second.totalHits]).toEqual([1, 2]);
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });

  it('goes straight to memory while the client is not ready, without a command', async () => {
    redis.status = 'reconnecting';

    const record = await storage.increment('k', 60_000, 10, 0, 'read-minute');

    expect(record.totalHits).toBe(1);
    expect(sharedIncrement).not.toHaveBeenCalled();
  });

  describe('retry window after a failed command (F28)', () => {
    const call = (): ReturnType<FallbackThrottlerStorage['increment']> =>
      storage.increment('k', 600_000, 100, 0, 'read-minute');

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps every call in memory without a Redis call during the window', async () => {
      sharedIncrement.mockRejectedValue(new Error('Command timed out'));
      await call();
      expect(sharedIncrement).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(REDIS_RETRY_AFTER_MS - 1);
      const a = await call();
      const b = await call();

      expect(sharedIncrement).toHaveBeenCalledTimes(1);
      expect([a.totalHits, b.totalHits]).toEqual([2, 3]);
    });

    it('sends exactly one call to Redis after the window', async () => {
      sharedIncrement.mockRejectedValueOnce(new Error('Command timed out'));
      await call();
      sharedIncrement.mockResolvedValue(RECORD);

      await vi.advanceTimersByTimeAsync(REDIS_RETRY_AFTER_MS);

      await expect(call()).resolves.toBe(RECORD);
      expect(sharedIncrement).toHaveBeenCalledTimes(2);
    });

    it('sends the calls that arrive while the probe is pending to memory', async () => {
      sharedIncrement.mockRejectedValueOnce(new Error('Command timed out'));
      await call();
      await vi.advanceTimersByTimeAsync(REDIS_RETRY_AFTER_MS);

      let resolveProbe: (value: typeof RECORD) => void = () => undefined;
      sharedIncrement.mockReturnValueOnce(
        new Promise<typeof RECORD>((resolve) => {
          resolveProbe = resolve;
        }),
      );
      const probe = call();
      const second = await call();

      expect(sharedIncrement).toHaveBeenCalledTimes(2);
      expect(second.totalHits).toBe(2);

      resolveProbe(RECORD);
      await expect(probe).resolves.toBe(RECORD);
    });

    it('stays in memory for another window when the probe fails', async () => {
      sharedIncrement.mockRejectedValue(new Error('Command timed out'));
      await call();
      await vi.advanceTimersByTimeAsync(REDIS_RETRY_AFTER_MS);
      await call();
      expect(sharedIncrement).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(REDIS_RETRY_AFTER_MS - 1);
      await call();
      expect(sharedIncrement).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      await call();
      expect(sharedIncrement).toHaveBeenCalledTimes(3);
    });

    it('goes back to Redis when the probe succeeds and logs it once', async () => {
      sharedIncrement.mockRejectedValueOnce(new Error('Command timed out'));
      await call();
      sharedIncrement.mockResolvedValue(RECORD);
      await vi.advanceTimersByTimeAsync(REDIS_RETRY_AFTER_MS);

      await call();
      await call();
      await call();

      expect(sharedIncrement).toHaveBeenCalledTimes(4);
      expect(Logger.prototype.log).toHaveBeenCalledTimes(1);
    });

    it('logs the warning once per outage and again for a new one', async () => {
      sharedIncrement.mockRejectedValue(new Error('Command timed out'));
      await call();
      await vi.advanceTimersByTimeAsync(REDIS_RETRY_AFTER_MS);
      await call();
      await call();
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);

      sharedIncrement.mockResolvedValue(RECORD);
      await vi.advanceTimersByTimeAsync(REDIS_RETRY_AFTER_MS);
      await call();

      sharedIncrement.mockRejectedValue(new Error('Command timed out'));
      await call();
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(2);
    });

    it('keeps the fallback when a call sent before the failure answers late', async () => {
      let resolveLate: (value: typeof RECORD) => void = () => undefined;
      sharedIncrement.mockReturnValueOnce(
        new Promise<typeof RECORD>((resolve) => {
          resolveLate = resolve;
        }),
      );
      sharedIncrement.mockRejectedValueOnce(new Error('Command timed out'));
      const late = call();
      await call();
      expect(sharedIncrement).toHaveBeenCalledTimes(2);

      resolveLate(RECORD);
      await expect(late).resolves.toBe(RECORD);

      const next = await call();
      expect(next.totalHits).toBe(2);
      expect(sharedIncrement).toHaveBeenCalledTimes(2);
      expect(Logger.prototype.log).not.toHaveBeenCalled();
    });

    it('tries Redis at once when a not-ready client becomes ready', async () => {
      redis.status = 'reconnecting';
      await call();
      expect(sharedIncrement).not.toHaveBeenCalled();

      redis.status = 'ready';
      sharedIncrement.mockResolvedValue(RECORD);

      await expect(call()).resolves.toBe(RECORD);
      expect(sharedIncrement).toHaveBeenCalledTimes(1);
      expect(Logger.prototype.log).toHaveBeenCalledTimes(1);
    });
  });
});
