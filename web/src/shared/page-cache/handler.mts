// The page cache's handler for `'use cache: remote'` (spec 0018 plan §3): Next's `CacheHandler`
// over the caches' Redis. Next loads `web/cache-handlers/redis.mjs` by path with plain Node, outside
// the bundle, and that file imports this one directly: so it imports no `server-only`, no `@/`
// alias and nothing but types, and holds only syntax Node's type stripping erases (no enums). It is
// `.mts` so that Node takes it as ESM without reparsing.
// Nothing in `src/` imports it, so the segment has no public entry.
import type { CacheEntry, CacheHandler } from 'next/dist/server/lib/cache-handlers/types';

// The part of an ioredis client the handler uses.
export interface PageCacheRedis {
  // ioredis' connection state: commands go out only while it is `ready`.
  readonly status: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

export interface PageCacheOptions {
  // Called once, on the first `get` or `set`: nothing connects during `next build`.
  createClient: () => PageCacheRedis;
  // The release's build id, read once on first use: releases never share entries (AC4).
  buildId: () => string;
  log?: (message: string) => void;
  now?: () => number;
}

// Bump with any change to the stored shape: blue and green share the caches' Redis.
const KEY_PREFIX = 'page-cache:v1';
// After a failure Redis is skipped this long, then one request tries again (V5, as 0014 O56).
const SKIP_MS = 10_000;
const LOG_INTERVAL_MS = 60_000;
// ioredis' states before its first connection; after a lost one it is `reconnecting`.
const STARTING = new Set(['wait', 'connect', 'connecting']);

interface StoredEntry {
  value: string;
  tags: string[];
  stale: number;
  timestamp: number;
  expire: number;
  revalidate: number;
}

export function createPageCacheHandler(options: PageCacheOptions): CacheHandler {
  const log = options.log ?? ((message: string) => console.warn(message));
  const now = options.now ?? Date.now;
  const pendingSets = new Map<string, Promise<void>>();
  let client: PageCacheRedis | undefined;
  let prefix: string | undefined;
  let failing = false;
  let skipUntil = 0;
  let lastLogAt = -Infinity;

  function report(reason: string): void {
    const at = now();
    if (at - lastLogAt < LOG_INTERVAL_MS) return;
    lastLogAt = at;
    log(`page cache: ${reason}; pages read the api directly`);
  }

  // The error only: the key would carry the cached function's arguments.
  function fail(what: string, error: unknown): void {
    failing = true;
    skipUntil = now() + SKIP_MS;
    report(`${what} (${error instanceof Error ? error.message : String(error)})`);
  }

  // The client and the key prefix, or undefined while the cache is skipped.
  function ready(): { redis: PageCacheRedis; keyPrefix: string } | undefined {
    if (failing) {
      if (now() < skipUntil) return undefined;
      // This request tries Redis; the ones that arrive while it waits go without it.
      skipUntil = now() + SKIP_MS;
    }
    try {
      client ??= options.createClient();
      prefix ??= `${KEY_PREFIX}:${options.buildId()}:`;
    } catch (error) {
      fail('setup failed', error);
      return undefined;
    }
    if (client.status !== 'ready') {
      // A client still making its first connection (every process start) is no failure.
      if (!STARTING.has(client.status)) report(`Redis not connected (${client.status})`);
      return undefined;
    }
    return { redis: client, keyPrefix: prefix };
  }

  return {
    async get(cacheKey) {
      // The interface requires it: a `get` during this key's `set` answers after it.
      const pending = pendingSets.get(cacheKey);
      if (pending) await pending;
      const target = ready();
      if (!target) return undefined;
      let raw: string | null;
      try {
        raw = await target.redis.get(target.keyPrefix + cacheKey);
      } catch (error) {
        fail('Redis failed', error);
        return undefined;
      }
      failing = false;
      if (raw === null) return undefined;
      const stored = parse(raw);
      // Past `revalidate` the entry is still returned: Next serves it and refreshes it in the
      // background (AC2). Redis' `EX` drops it at `expire`; this covers its rounding.
      if (!stored || now() > stored.timestamp + stored.expire * 1000) return undefined;
      const bytes = Buffer.from(stored.value, 'base64');
      return {
        value: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(bytes));
            controller.close();
          },
        }),
        tags: stored.tags,
        stale: stored.stale,
        timestamp: stored.timestamp,
        expire: stored.expire,
        revalidate: stored.revalidate,
      };
    },

    async set(cacheKey, pendingEntry) {
      let resolvePending = () => {};
      const pending = new Promise<void>((resolve) => {
        resolvePending = resolve;
      });
      pendingSets.set(cacheKey, pending);
      try {
        const entry = await pendingEntry;
        // An `expire` of 0 is dynamic: Next regenerates it on every read (as its default handler).
        if (entry.expire <= 0) return;
        // A stream that fails part way is not stored: a partial entry would be a broken page.
        const value = await readAll(entry).catch(() => undefined);
        if (value === undefined) return;
        const target = ready();
        if (!target) return;
        const stored: StoredEntry = {
          value: value.toString('base64'),
          tags: entry.tags,
          stale: entry.stale,
          timestamp: entry.timestamp,
          expire: entry.expire,
          revalidate: entry.revalidate,
        };
        try {
          await target.redis.set(
            target.keyPrefix + cacheKey,
            JSON.stringify(stored),
            'EX',
            Math.ceil(entry.expire),
          );
          failing = false;
        } catch (error) {
          fail('Redis failed', error);
        }
      } catch {
        // A rejected pending entry: nothing to store.
      } finally {
        if (pendingSets.get(cacheKey) === pending) pendingSets.delete(cacheKey);
        resolvePending();
      }
    },

    // No tags are used (plan §3): nothing to sync, nothing ever revalidated.
    async refreshTags() {},
    async getExpiration() {
      return 0;
    },
    async updateTags() {},
  };
}

async function readAll(entry: CacheEntry): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = entry.value.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}

function parse(raw: string): StoredEntry | undefined {
  try {
    const stored = JSON.parse(raw) as Partial<StoredEntry>;
    const numbers = [stored.stale, stored.timestamp, stored.expire, stored.revalidate];
    if (
      typeof stored.value !== 'string' ||
      !Array.isArray(stored.tags) ||
      !numbers.every((n) => typeof n === 'number')
    ) {
      return undefined;
    }
    return stored as StoredEntry;
  } catch {
    return undefined;
  }
}
