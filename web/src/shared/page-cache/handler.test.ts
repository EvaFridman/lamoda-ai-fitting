// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createPageCacheHandler,
  MAX_ENTRY_BYTES,
  type PageCacheRedis,
  SKIP_UNTIL,
} from './handler.mjs';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

interface Entry {
  value: ReadableStream<Uint8Array>;
  tags: string[];
  stale: number;
  timestamp: number;
  expire: number;
  revalidate: number;
}

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function entryOf(overrides: Partial<Entry> = {}): Entry {
  return {
    value: streamOf(new TextEncoder().encode('<html>')),
    tags: ['a', 'b'],
    stale: 30,
    timestamp: 1_000,
    expire: 300,
    revalidate: 60,
    ...overrides,
  };
}

async function bytesOf(stream: ReadableStream<Uint8Array>): Promise<number[]> {
  const out: number[] = [];
  const reader = stream.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    out.push(...chunk.value);
  }
  return out;
}

function setup(options: { status?: string; clock?: { at: number } } = {}) {
  const store = new Map<string, string>();
  const redis = {
    status: options.status ?? 'ready',
    get: vi.fn<PageCacheRedis['get']>((key) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn<PageCacheRedis['set']>((key, value) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
  };
  const clock = options.clock ?? { at: 1_000 };
  const createClient = vi.fn(() => redis);
  const buildId = vi.fn(() => 'build1');
  const log = vi.fn();
  const publish = vi.fn<(until: number) => void>();
  const handler = createPageCacheHandler({
    createClient,
    buildId,
    log,
    now: () => clock.at,
    publishSkipUntil: publish,
  });
  return { store, redis, clock, createClient, buildId, log, publish, handler };
}

describe('createPageCacheHandler laziness and keys', () => {
  it('connects and reads the build id only on first use, once', async () => {
    const { handler, createClient, buildId } = setup();
    expect(createClient).not.toHaveBeenCalled();
    expect(buildId).not.toHaveBeenCalled();
    await handler.get('k1', []);
    await handler.get('k2', []);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(buildId).toHaveBeenCalledTimes(1);
  });

  it('keys entries by build id and the sha256 of the Next key', async () => {
    const { handler, redis } = setup();
    await handler.set('abc', Promise.resolve(entryOf()));
    expect(redis.set).toHaveBeenCalledWith(
      `page-cache:v1:build1:${sha256('abc')}`,
      expect.any(String),
      'EX',
      300,
    );
    await handler.get('abc', []);
    expect(redis.get).toHaveBeenCalledWith(`page-cache:v1:build1:${sha256('abc')}`);
  });

  it('never gives Redis the Next key, which holds the cached function arguments', async () => {
    const { handler, redis } = setup();
    const key = '["build","remote:0",{"q":"distinctive-search-text"}]';
    await handler.set(key, Promise.resolve(entryOf()));
    await handler.get(key, []);
    const sent = JSON.stringify([...redis.get.mock.calls, ...redis.set.mock.calls]);
    expect(sent).not.toContain('distinctive-search-text');
    expect(sent).not.toContain(key);
  });

  it('gives different Next keys different Redis keys', async () => {
    const { handler, redis } = setup();
    await handler.set('a', Promise.resolve(entryOf()));
    await handler.set('b', Promise.resolve(entryOf()));
    expect(redis.set.mock.calls[0]?.[0]).not.toBe(redis.set.mock.calls[1]?.[0]);
  });

  it('does not share entries between two builds (AC4)', async () => {
    const store = new Map<string, string>();
    const redis: PageCacheRedis = {
      status: 'ready',
      get: (key) => Promise.resolve(store.get(key) ?? null),
      set: (key, value) => {
        store.set(key, value);
        return Promise.resolve('OK');
      },
    };
    const make = (buildId: string) =>
      createPageCacheHandler({
        createClient: () => redis,
        buildId: () => buildId,
        now: () => 1_000,
      });
    const one = make('one');
    const two = make('two');
    await one.set('page', Promise.resolve(entryOf()));
    expect(await one.get('page', [])).toBeDefined();
    expect(await two.get('page', [])).toBeUndefined();
  });
});

describe('createPageCacheHandler set and get', () => {
  it('stores the bytes as base64 JSON with EX rounded up', async () => {
    const { handler, redis } = setup();
    const entry = entryOf({
      value: streamOf(new Uint8Array([1, 2]), new Uint8Array([3])),
      expire: 299.2,
    });
    await handler.set('k', Promise.resolve(entry));
    const [, json, mode, seconds] = redis.set.mock.calls[0]!;
    expect(mode).toBe('EX');
    expect(seconds).toBe(300);
    expect(JSON.parse(json)).toEqual({
      value: Buffer.from([1, 2, 3]).toString('base64'),
      tags: ['a', 'b'],
      stale: 30,
      timestamp: 1_000,
      expire: 299.2,
      revalidate: 60,
    });
  });

  it('returns the stored entry with the same bytes and fields', async () => {
    const { handler } = setup();
    await handler.set(
      'k',
      Promise.resolve(entryOf({ value: streamOf(new Uint8Array([9, 8]), new Uint8Array([7])) })),
    );
    const got = await handler.get('k', []);
    expect(got).toBeDefined();
    expect(await bytesOf(got!.value)).toEqual([9, 8, 7]);
    expect(got).toMatchObject({
      tags: ['a', 'b'],
      stale: 30,
      timestamp: 1_000,
      expire: 300,
      revalidate: 60,
    });
  });

  it('returns undefined for a key never stored', async () => {
    const { handler } = setup();
    expect(await handler.get('missing', [])).toBeUndefined();
  });

  it('makes a get during a set wait for it and return the stored entry', async () => {
    const { handler, redis } = setup();
    let resolveEntry: (entry: Entry) => void = () => {};
    const pending = new Promise<Entry>((resolve) => {
      resolveEntry = resolve;
    });
    const setting = handler.set('k', pending);
    const getting = handler.get('k', []);
    await Promise.resolve();
    expect(redis.get).not.toHaveBeenCalled();
    resolveEntry(entryOf());
    await setting;
    const got = await getting;
    expect(got).toBeDefined();
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it('still returns an entry past revalidate, with revalidate unchanged (AC2)', async () => {
    const { handler, clock } = setup();
    await handler.set(
      'k',
      Promise.resolve(entryOf({ timestamp: 1_000, revalidate: 60, expire: 300 })),
    );
    clock.at = 1_000 + 100_000;
    const got = await handler.get('k', []);
    expect(got?.revalidate).toBe(60);
    expect(got?.expire).toBe(300);
  });

  it('returns undefined past expire', async () => {
    const { handler, clock } = setup();
    await handler.set('k', Promise.resolve(entryOf({ timestamp: 1_000, expire: 300 })));
    clock.at = 1_000 + 300_001;
    expect(await handler.get('k', [])).toBeUndefined();
  });

  it.each([0, -1])('does not store an entry with expire %s', async (expire) => {
    const { handler, redis } = setup();
    await handler.set('k', Promise.resolve(entryOf({ expire })));
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('does not store a stream that errors part way', async () => {
    const { handler, redis } = setup();
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.error(new Error('boom'));
      },
    });
    await expect(
      handler.set('k', Promise.resolve(entryOf({ value: broken }))),
    ).resolves.toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('does not store a rejected pending entry, does not throw, and a later get does not hang', async () => {
    const { handler, redis } = setup();
    await expect(
      handler.set('k', Promise.reject(new Error('render failed'))),
    ).resolves.toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
    expect(await handler.get('k', [])).toBeUndefined();
  });
});

describe('createPageCacheHandler entry size', () => {
  const VALUE = new TextEncoder().encode('<html>');

  // The JSON the handler writes, in its key order.
  function storedJson(entry: Omit<Entry, 'value'>): string {
    return JSON.stringify({
      value: Buffer.from(VALUE).toString('base64'),
      tags: entry.tags,
      stale: entry.stale,
      timestamp: entry.timestamp,
      expire: entry.expire,
      revalidate: entry.revalidate,
    });
  }

  // An entry whose stored JSON is exactly `target` bytes, padded by a tag.
  function entryOfJsonSize(target: number): Entry {
    const bare = entryOf({ tags: ['a', ''] });
    const padding = target - Buffer.byteLength(storedJson(bare));
    const tags = ['a', 'x'.repeat(padding)];
    expect(Buffer.byteLength(storedJson({ ...bare, tags }))).toBe(target);
    return entryOf({ value: streamOf(VALUE), tags });
  }

  it('stores an entry whose JSON is exactly at the limit', async () => {
    const { handler, redis, log } = setup();
    await handler.set('k', Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES)));
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(Buffer.byteLength(redis.set.mock.calls[0]![1])).toBe(MAX_ENTRY_BYTES);
    expect(log).not.toHaveBeenCalled();
  });

  it('does not store an entry whose JSON is one byte over the limit, and logs it without the key', async () => {
    const { handler, redis, log } = setup();
    const key = 'distinctive-key-text';
    await handler.set(key, Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES + 1)));
    expect(redis.set).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('page cache: an entry over 1 MB is not stored');
    expect(log.mock.calls[0]![0]).not.toContain(key);
    expect(await handler.get(key, [])).toBeUndefined();
  });

  it('logs a second oversized entry within a minute only once', async () => {
    const { handler, log } = setup();
    await handler.set('a', Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES + 1)));
    await handler.set('b', Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES + 1)));
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('logs an oversized entry again after a minute', async () => {
    const { handler, clock, log } = setup();
    await handler.set('a', Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES + 1)));
    clock.at += 60_000;
    await handler.set('b', Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES + 1)));
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('does not count an oversized entry as a Redis failure', async () => {
    const { handler, redis, publish } = setup();
    await handler.set('a', Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES + 1)));
    await handler.set('b', Promise.resolve(entryOf()));
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not let an oversize line hide a failure line in the same minute', async () => {
    const { handler, redis, log } = setup();
    await handler.set('a', Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES + 1)));
    redis.get.mockRejectedValueOnce(new Error('down'));
    await handler.get('k', []);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining('Redis failed'));
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining('pages read the api directly'));
  });

  it('does not let a failure line hide an oversize line in the same minute', async () => {
    const { handler, redis, clock, log } = setup();
    redis.get.mockRejectedValueOnce(new Error('down'));
    await handler.get('k', []);
    clock.at += 10_000;
    await handler.set('a', Promise.resolve(entryOfJsonSize(MAX_ENTRY_BYTES + 1)));
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith('page cache: an entry over 1 MB is not stored');
  });
});

describe('createPageCacheHandler publishing the skip', () => {
  it('publishes nothing while Redis works', async () => {
    const { handler, publish } = setup();
    await handler.get('k', []);
    await handler.set('k', Promise.resolve(entryOf()));
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes now + 10 s on a failure', async () => {
    const { handler, redis, publish } = setup();
    redis.get.mockRejectedValueOnce(new Error('down'));
    await handler.get('k', []);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(11_000);
  });

  it('publishes now + 10 s on a failed set and on a setup failure', async () => {
    const one = setup();
    one.redis.set.mockRejectedValueOnce(new Error('OOM'));
    await one.handler.set('k', Promise.resolve(entryOf()));
    expect(one.publish).toHaveBeenCalledWith(11_000);

    const publish = vi.fn();
    const handler = createPageCacheHandler({
      createClient: () => {
        throw new Error('bad url');
      },
      buildId: () => 'b',
      log: vi.fn(),
      now: () => 5_000,
      publishSkipUntil: publish,
    });
    await handler.get('k', []);
    expect(publish).toHaveBeenCalledWith(15_000);
  });

  it('publishes now + 10 s again when a probe starts, then 0 on its success', async () => {
    const { handler, redis, clock, publish } = setup();
    redis.get.mockRejectedValueOnce(new Error('down'));
    await handler.get('k', []);
    clock.at += 10_000;
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000, 21_000, 0]);
  });

  it('publishes 0 only on the first success after a failure', async () => {
    const { handler, redis, clock, publish } = setup();
    redis.get.mockRejectedValueOnce(new Error('down'));
    await handler.get('k', []);
    clock.at += 10_000;
    await handler.get('a', []);
    await handler.get('b', []);
    await handler.set('c', Promise.resolve(entryOf()));
    expect(publish.mock.calls.filter(([until]) => until === 0)).toHaveLength(1);
  });

  it('publishes the next probe, not 0, when the probe fails', async () => {
    const { handler, redis, clock, publish } = setup();
    redis.get.mockRejectedValue(new Error('down'));
    await handler.get('k', []);
    clock.at += 10_000;
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000, 21_000, 21_000]);
  });

  it.each(['wait', 'connect', 'connecting'])(
    'publishes now + 1 s while the client is %s',
    async (status) => {
      const { handler, publish } = setup({ status });
      await handler.get('k', []);
      expect(publish).toHaveBeenCalledWith(2_000);
    },
  );

  it('writes the globalThis slot by default, and SKIP_UNTIL is that slot', async () => {
    const slot = globalThis as Record<symbol, unknown>;
    expect(SKIP_UNTIL).toBe(Symbol.for('lamoda-ai-fitting.page-cache.skip-until'));
    try {
      const redis = {
        status: 'ready',
        get: vi.fn<PageCacheRedis['get']>().mockRejectedValueOnce(new Error('down')),
        set: vi.fn(),
      };
      redis.get.mockResolvedValue(null);
      const clock = { at: 1_000 };
      const handler = createPageCacheHandler({
        createClient: () => redis,
        buildId: () => 'b',
        log: vi.fn(),
        now: () => clock.at,
      });
      await handler.get('k', []);
      expect(slot[SKIP_UNTIL]).toBe(11_000);
      clock.at += 10_000;
      await handler.get('k', []);
      expect(slot[SKIP_UNTIL]).toBe(0);
    } finally {
      delete slot[SKIP_UNTIL];
    }
  });
});

describe('createPageCacheHandler when Redis fails', () => {
  it('turns a failed get into a miss and skips Redis for 10 s, then tries again', async () => {
    const { handler, redis, clock } = setup();
    redis.get.mockRejectedValueOnce(new Error('down'));
    expect(await handler.get('k', [])).toBeUndefined();
    expect(redis.get).toHaveBeenCalledTimes(1);

    clock.at += 9_999;
    expect(await handler.get('k', [])).toBeUndefined();
    await handler.set('k', Promise.resolve(entryOf()));
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();

    clock.at += 1;
    await handler.get('k', []);
    expect(redis.get).toHaveBeenCalledTimes(2);
  });

  it('skips Redis for 10 s after a failed set, then tries again', async () => {
    const { handler, redis, clock } = setup();
    redis.set.mockRejectedValueOnce(new Error('OOM'));
    await expect(handler.set('k', Promise.resolve(entryOf()))).resolves.toBeUndefined();
    expect(redis.set).toHaveBeenCalledTimes(1);

    clock.at += 9_999;
    await handler.set('k', Promise.resolve(entryOf()));
    expect(await handler.get('k', [])).toBeUndefined();
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.get).not.toHaveBeenCalled();

    clock.at += 1;
    await handler.set('k', Promise.resolve(entryOf()));
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it.each(['wait', 'connect', 'connecting'])(
    'misses without a command and without a log line while the client is %s',
    async (status) => {
      const { handler, redis, log } = setup({ status });
      expect(await handler.get('k', [])).toBeUndefined();
      await handler.set('k', Promise.resolve(entryOf()));
      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    },
  );

  it.each(['reconnecting', 'close', 'end'])(
    'misses without a command and logs once while the client is %s',
    async (status) => {
      const { handler, redis, log } = setup({ status });
      expect(await handler.get('k', [])).toBeUndefined();
      await handler.set('k', Promise.resolve(entryOf()));
      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining(status));
    },
  );

  it.each(['reconnecting', 'close', 'end'])(
    'treats a %s client as a failure: skips 10 s, publishes it, probes once, then recovers',
    async (status) => {
      const { handler, redis, clock, publish, log } = setup({ status });
      await handler.get('k', []);
      expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000]);
      expect(log).toHaveBeenCalledWith(
        `page cache: Redis not connected (${status}); pages read the api directly`,
      );

      // Within the skip the client is not even looked at.
      redis.status = 'ready';
      clock.at += 9_999;
      expect(await handler.get('k', [])).toBeUndefined();
      expect(redis.get).not.toHaveBeenCalled();

      clock.at += 1;
      await handler.get('k', []);
      expect(redis.get).toHaveBeenCalledTimes(1);
      expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000, 21_000, 0]);
    },
  );

  it('restarts the skip when the probe still finds the client not connected', async () => {
    const { handler, clock, publish } = setup({ status: 'reconnecting' });
    await handler.get('k', []);
    clock.at += 10_000;
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000, 21_000, 21_000]);
  });

  it('keeps the 10 s skip when a never-ready client that failed is found connecting by the probe', async () => {
    const { handler, redis, clock, publish, log } = setup({ status: 'reconnecting' });
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000]);
    expect(log).toHaveBeenCalledTimes(1);

    redis.status = 'connecting';
    clock.at += 10_000;
    publish.mockClear();
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([21_000, 21_000]);
    expect(publish).not.toHaveBeenCalledWith(22_000);

    redis.status = 'ready';
    clock.at += 9_999;
    expect(await handler.get('k', [])).toBeUndefined();
    await handler.set('k', Promise.resolve(entryOf()));
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();

    clock.at += 1;
    await handler.get('k', []);
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it.each(['wait', 'connect', 'connecting'])(
    'does not count a %s client as a failure: it is looked at again on every call',
    async (status) => {
      const { handler, redis, publish } = setup({ status });
      await handler.get('k', []);
      redis.status = 'ready';
      await handler.get('k', []);
      expect(redis.get).toHaveBeenCalledTimes(1);
      expect(publish.mock.calls.map(([until]) => until)).toEqual([2_000]);
    },
  );

  it('counts a connecting client as a failure once it has been ready (ioredis retries through connecting)', async () => {
    const { handler, redis, clock, publish, log } = setup();
    await handler.get('k', []);
    expect(publish).not.toHaveBeenCalled();

    redis.get.mockRejectedValueOnce(new Error('down'));
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000]);
    expect(log).toHaveBeenCalledTimes(1);

    redis.status = 'connecting';
    clock.at += 10_000;
    publish.mockClear();
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([21_000, 21_000]);
    expect(publish).not.toHaveBeenCalledWith(22_000);

    redis.status = 'ready';
    clock.at += 9_999;
    expect(await handler.get('k', [])).toBeUndefined();
    expect(redis.get).toHaveBeenCalledTimes(2);

    clock.at += 1;
    await handler.get('k', []);
    expect(redis.get).toHaveBeenCalledTimes(3);
  });

  it('counts a connecting client as a failure after a lost connection that was ready', async () => {
    const { handler, redis, clock, publish } = setup();
    await handler.get('k', []);
    redis.status = 'reconnecting';
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000]);

    redis.status = 'connecting';
    clock.at += 10_000;
    await handler.get('k', []);
    expect(publish.mock.calls.map(([until]) => until)).toEqual([11_000, 21_000, 21_000]);
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it('logs a client that is not connected again only after 60 s', async () => {
    const { handler, clock, log } = setup({ status: 'reconnecting' });
    await handler.get('k', []);
    clock.at += 59_999;
    await handler.get('k', []);
    expect(log).toHaveBeenCalledTimes(1);
    // The probe above restarted the skip to 70 999.
    clock.at = 71_000;
    await handler.get('k', []);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('misses without throwing when createClient throws, logs "setup failed" and skips 10 s', async () => {
    const log = vi.fn();
    const clock = { at: 1_000 };
    const createClient = vi.fn((): PageCacheRedis => {
      throw new Error('bad url');
    });
    const buildId = vi.fn(() => 'b');
    const handler = createPageCacheHandler({ createClient, buildId, log, now: () => clock.at });
    expect(await handler.get('k', [])).toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('setup failed'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('bad url'));

    clock.at += 9_999;
    await expect(handler.set('k', Promise.resolve(entryOf()))).resolves.toBeUndefined();
    expect(await handler.get('k', [])).toBeUndefined();
    expect(createClient).toHaveBeenCalledTimes(1);

    clock.at += 1;
    await handler.get('k', []);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it('skips 10 s after buildId throws, then tries again', async () => {
    const log = vi.fn();
    const clock = { at: 1_000 };
    const redis = { status: 'ready', get: vi.fn(() => Promise.resolve(null)), set: vi.fn() };
    const createClient = vi.fn(() => redis);
    const buildId = vi
      .fn<() => string>()
      .mockImplementationOnce(() => {
        throw new Error('no build id');
      })
      .mockReturnValue('b');
    const handler = createPageCacheHandler({ createClient, buildId, log, now: () => clock.at });
    expect(await handler.get('k', [])).toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('setup failed'));

    clock.at += 9_999;
    await handler.get('k', []);
    expect(buildId).toHaveBeenCalledTimes(1);
    expect(redis.get).not.toHaveBeenCalled();

    clock.at += 1;
    await handler.get('k', []);
    expect(buildId).toHaveBeenCalledTimes(2);
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it('logs "Redis failed" for a failed command', async () => {
    const { handler, redis, log } = setup();
    redis.get.mockRejectedValueOnce(new Error('down'));
    await handler.get('k', []);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Redis failed'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('down'));
  });

  describe('the probe after the skip', () => {
    function deferred<T>() {
      let resolve: (value: T) => void = () => {};
      let reject: (error: Error) => void = () => {};
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    it('lets only one of several concurrent gets send a command; success reopens the cache', async () => {
      const { handler, redis, clock } = setup();
      redis.get.mockRejectedValueOnce(new Error('down'));
      await handler.get('k', []);
      clock.at += 10_000;

      const probe = deferred<string | null>();
      redis.get.mockReturnValueOnce(probe.promise);
      const gets = [handler.get('a', []), handler.get('b', []), handler.get('c', [])];
      await vi.waitFor(() => expect(redis.get).toHaveBeenCalledTimes(2));
      probe.resolve(null);
      expect(await Promise.all(gets)).toEqual([undefined, undefined, undefined]);
      expect(redis.get).toHaveBeenCalledTimes(2);

      await handler.get('d', []);
      await handler.get('e', []);
      expect(redis.get).toHaveBeenCalledTimes(4);
    });

    it('restarts the skip when the probing get fails', async () => {
      const { handler, redis, clock } = setup();
      redis.get.mockRejectedValueOnce(new Error('down'));
      await handler.get('k', []);
      clock.at += 10_000;

      const probe = deferred<string | null>();
      redis.get.mockReturnValueOnce(probe.promise);
      const gets = [handler.get('a', []), handler.get('b', [])];
      await vi.waitFor(() => expect(redis.get).toHaveBeenCalledTimes(2));
      probe.reject(new Error('still down'));
      await Promise.all(gets);
      expect(redis.get).toHaveBeenCalledTimes(2);

      clock.at += 9_999;
      await handler.get('c', []);
      expect(redis.get).toHaveBeenCalledTimes(2);
      clock.at += 1;
      await handler.get('d', []);
      expect(redis.get).toHaveBeenCalledTimes(3);
    });

    it('lets only one of several concurrent sets send a command; success reopens the cache', async () => {
      const { handler, redis, clock } = setup();
      redis.set.mockRejectedValueOnce(new Error('OOM'));
      await handler.set('k', Promise.resolve(entryOf()));
      clock.at += 10_000;

      const probe = deferred<unknown>();
      redis.set.mockReturnValueOnce(probe.promise);
      const sets = ['a', 'b', 'c'].map((key) => handler.set(key, Promise.resolve(entryOf())));
      await vi.waitFor(() => expect(redis.set).toHaveBeenCalledTimes(2));
      probe.resolve('OK');
      await Promise.all(sets);
      expect(redis.set).toHaveBeenCalledTimes(2);

      await handler.set('d', Promise.resolve(entryOf()));
      await handler.set('e', Promise.resolve(entryOf()));
      expect(redis.set).toHaveBeenCalledTimes(4);
    });

    it('restarts the skip when the probing set fails', async () => {
      const { handler, redis, clock } = setup();
      redis.set.mockRejectedValueOnce(new Error('OOM'));
      await handler.set('k', Promise.resolve(entryOf()));
      clock.at += 10_000;

      redis.set.mockRejectedValueOnce(new Error('OOM'));
      await Promise.all(['a', 'b'].map((key) => handler.set(key, Promise.resolve(entryOf()))));
      expect(redis.set).toHaveBeenCalledTimes(2);

      clock.at += 9_999;
      await handler.set('c', Promise.resolve(entryOf()));
      expect(redis.set).toHaveBeenCalledTimes(2);
      clock.at += 1;
      await handler.set('d', Promise.resolve(entryOf()));
      expect(redis.set).toHaveBeenCalledTimes(3);
    });
  });

  it('misses without throwing when buildId throws', async () => {
    const handler = createPageCacheHandler({
      createClient: () => ({ status: 'ready', get: vi.fn(), set: vi.fn() }),
      buildId: () => {
        throw new Error('no build id');
      },
      log: vi.fn(),
      now: () => 1_000,
    });
    expect(await handler.get('k', [])).toBeUndefined();
    await expect(handler.set('k', Promise.resolve(entryOf()))).resolves.toBeUndefined();
  });

  it('logs at most once per 60 s over any number of failures, then again', async () => {
    const { handler, redis, clock, log } = setup();
    redis.get.mockRejectedValue(new Error('down'));
    for (let i = 0; i < 5; i++) {
      await handler.get('k', []);
      clock.at += 10_000;
    }
    expect(redis.get).toHaveBeenCalledTimes(5);
    expect(log).toHaveBeenCalledTimes(1);

    clock.at = 1_000 + 60_000;
    await handler.get('k', []);
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe('createPageCacheHandler stored values', () => {
  it.each([
    ['malformed JSON', '{nope'],
    ['not an object', '5'],
    [
      'a missing value',
      JSON.stringify({ tags: [], stale: 1, timestamp: 1, expire: 1, revalidate: 1 }),
    ],
    [
      'a value that is not a string',
      JSON.stringify({ value: 1, tags: [], stale: 1, timestamp: 1, expire: 1, revalidate: 1 }),
    ],
    [
      'tags that are not a list',
      JSON.stringify({ value: '', tags: 'x', stale: 1, timestamp: 1, expire: 1, revalidate: 1 }),
    ],
    [
      'a number that is a string',
      JSON.stringify({ value: '', tags: [], stale: 1, timestamp: '1', expire: 1, revalidate: 1 }),
    ],
  ])('treats %s as a miss', async (_name, raw) => {
    const { handler, store } = setup();
    store.set(`page-cache:v1:build1:${sha256('k')}`, raw);
    expect(await handler.get('k', [])).toBeUndefined();
  });
});

describe('createPageCacheHandler tags', () => {
  it('has no expiration and resolves the tag calls', async () => {
    const { handler } = setup();
    expect(await handler.getExpiration(['t'])).toBe(0);
    await expect(handler.refreshTags()).resolves.toBeUndefined();
    await expect(handler.updateTags(['t'], { expire: 1 })).resolves.toBeUndefined();
  });
});
