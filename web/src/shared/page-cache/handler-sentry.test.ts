// @vitest-environment node
import * as Sentry from '@sentry/nextjs';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { Duplex } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createPageCacheHandler } from './handler.mjs';

// The real SDK with Redis tracing and the real ioredis, whose connection is an in-memory stream
// answering GET with a miss and SET with OK: no server, no network, yet the client publishes every
// command it writes to Sentry's Redis spans, which is what V22 is about (Next's key holds the cached
// function's arguments, e.g. a visitor's search).
const sent: string[] = [];
const ARGUMENT = 'distinctive-search-argument';
const NEXT_KEY = `["build","remote",{"q":"${ARGUMENT}"}]`;
const STORED_TEXT = '<html>distinctive-stored-value</html>';
const HASHED_KEY = `page-cache:v1:build1:${createHash('sha256').update(NEXT_KEY).digest('hex')}`;

function memoryStream(): Duplex {
  const stream = new Duplex({
    read() {},
    write(chunk: Buffer, _encoding, done) {
      const command = chunk.toString().toLowerCase();
      stream.push(command.includes('\r\nset\r\n') ? '+OK\r\n' : '$-1\r\n');
      done();
    },
  });
  return Object.assign(stream, { setNoDelay: () => stream, setKeepAlive: () => stream });
}

class MemoryConnector {
  connecting = false;
  stream: Duplex | undefined;
  check() {
    return true;
  }
  connect() {
    this.stream = memoryStream();
    return Promise.resolve(this.stream);
  }
  disconnect() {
    this.stream?.destroy();
  }
}

let client: Redis;

beforeAll(async () => {
  Sentry.init({
    dsn: 'https://public@example.invalid/1',
    defaultIntegrations: false,
    integrations: [Sentry.redisIntegration()],
    tracesSampleRate: 1,
    transport: () => ({
      send: (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
  });
  client = new Redis({
    Connector: MemoryConnector as never,
    lazyConnect: true,
    enableReadyCheck: false,
    disableClientInfo: true,
    retryStrategy: () => null,
  });
  client.on('error', () => {});
  await client.connect();
});

afterAll(async () => {
  client.disconnect();
  await Sentry.close();
});

describe('the page cache handler and Sentry Redis spans', () => {
  it('shows Sentry the hashed key only, never the Next key, its arguments or the value', async () => {
    const handler = createPageCacheHandler({
      createClient: () => client,
      buildId: () => 'build1',
      log: vi.fn(),
    });
    const entry = {
      value: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(STORED_TEXT));
          controller.close();
        },
      }),
      tags: [],
      stale: 30,
      timestamp: Date.now(),
      expire: 300,
      revalidate: 60,
    };

    await Sentry.startSpan({ name: 'render', op: 'test' }, async () => {
      await handler.get(NEXT_KEY, []);
      await handler.set(NEXT_KEY, Promise.resolve(entry));
    });
    await Sentry.flush(1000);

    const all = sent.join('\n');
    // Both commands became spans, each naming the hashed key.
    expect(all.split(HASHED_KEY).length - 1).toBeGreaterThanOrEqual(2);
    expect(all).not.toContain(ARGUMENT);
    expect(all).not.toContain(NEXT_KEY);
    expect(all).not.toContain(STORED_TEXT);
    expect(all).not.toContain(Buffer.from(STORED_TEXT).toString('base64'));
    expect(all).not.toContain('"expire"');
  });
});
