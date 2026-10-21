// The `remote` cache handler (`cacheHandlers` in next.config.ts, spec 0018 plan §3): wires ioredis
// and the release's build id to the handler's logic. Next imports this file by path with plain
// Node, outside the bundle, so it imports the logic as a `.mts` file that Node runs by stripping its
// types (`.mts`, so Node takes it as ESM at once: web's package.json names no type), and reads its
// environment itself (`server-env.ts` imports `server-only`, which plain Node refuses).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Redis } from 'ioredis';

import { createPageCacheHandler } from '../src/shared/page-cache/handler.mts';

export default createPageCacheHandler({
  createClient() {
    const url = process.env.REDIS_CACHE_URL ?? '';
    if (!/^rediss?:\/\//.test(url)) throw new Error('REDIS_CACHE_URL must be a redis:// URL');
    const client = new Redis(url, {
      // A command on a page's render path: a Redis that holds the connection but does not answer
      // costs a page at most this long, then the cache is skipped for 10 s (V5).
      commandTimeout: 200,
      maxRetriesPerRequest: 1,
      // The handler sends nothing while the client is not `ready`; this keeps a race from queueing.
      enableOfflineQueue: false,
    });
    // The handler reports a client that is not ready, once a minute; without a listener every
    // reconnect's error would be an unhandled 'error' event.
    client.on('error', () => {});
    return client;
  },
  // A built server runs in the folder that holds `.next`: the standalone server changes into its
  // own, `next start` runs in web/. Not a path next to this file: the bundler would try to resolve
  // it as a module. `next dev` writes no BUILD_ID and names its build `development`, as here.
  buildId: () =>
    process.env.NODE_ENV === 'production'
      ? readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim()
      : 'development',
});
