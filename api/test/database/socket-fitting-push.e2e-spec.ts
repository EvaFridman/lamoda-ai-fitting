import { createHash, randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { startTestRedis, type TestRedis } from '../support/redis.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 90_000 });

const CHANNEL = 'fitting-events';
const EVENT = 'fitting:finished';

interface Received {
  event: string;
  args: unknown[];
}

// Spec 0019 T13, AC25, A71: a finished fitting reaches only its user's sockets, with ids and a status.
describe('fitting push over the socket (database e2e)', () => {
  let redis: TestRedis;
  let close: () => Promise<void>;
  let prisma: PrismaClient;
  let app: INestApplication;
  let url: string;
  let signIn: (typeof import('../support/sign-in.js'))['signIn'];
  const sockets: Socket[] = [];

  beforeAll(async () => {
    redis = await startTestRedis('noeviction');
    // ConfigModule validates the process environment when the module is imported.
    vi.resetModules();
    vi.stubEnv('REDIS_URL', redis.url);
    const { createTestApp } = await import('../support/test-app.js');
    const { SocketIoAdapter } = await import('../../src/realtime/socket-io.adapter.js');
    ({ signIn } = await import('../support/sign-in.js'));
    const testApp = await createTestApp({
      socketAdapter: (created) => new SocketIoAdapter(created, 'http://localhost:3001', 65_536),
    });
    ({ app, close, prisma } = testApp);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    // The notifier subscribes after the app started: publish only once it is there.
    await vi.waitFor(async () => {
      const [, count] = (await redis.client.pubsub('NUMSUB', CHANNEL)) as [string, number];
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    try {
      await close?.();
    } finally {
      vi.unstubAllEnvs();
      await redis?.stop();
    }
  });

  async function connect(cookie?: string): Promise<{ socket: Socket; received: Received[] }> {
    const socket = io(url, {
      reconnection: false,
      forceNew: true,
      transports: ['websocket'],
      ...(cookie === undefined ? {} : { extraHeaders: { cookie } }),
    });
    sockets.push(socket);
    const received: Received[] = [];
    socket.onAny((event: string, ...args: unknown[]) => {
      received.push({ event, args });
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    // The room is joined by the gateway's connection handler: ping is answered after it.
    await expect(socket.timeout(5000).emitWithAck('ping')).resolves.toBe('pong');
    received.length = 0;
    return { socket, received };
  }

  const message = (userId: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      userId,
      generationId: randomUUID(),
      kind: 'single',
      status: 'completed',
      ...extra,
    });

  // Redis keeps the order of a channel, so once the marker user's socket got its push, every
  // message published before it has been handled.
  async function flush(): Promise<void> {
    const marker = await signIn(app);
    const { received } = await connect(marker.cookie);
    await redis.client.publish(CHANNEL, message(marker.userId));
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });
  }

  it('pushes exactly the generation, kind and status to the sockets of its user', async () => {
    const user = await signIn(app);
    const first = await connect(user.cookie);
    const second = await connect(user.cookie);
    const generationId = randomUUID();

    await redis.client.publish(
      CHANNEL,
      JSON.stringify({ userId: user.userId, generationId, kind: 'look', status: 'failed' }),
    );

    await vi.waitFor(() => {
      expect(first.received).toHaveLength(1);
      expect(second.received).toHaveLength(1);
    });
    expect(first.received[0]).toEqual({
      event: EVENT,
      args: [{ generationId, kind: 'look', status: 'failed' }],
    });
    expect(second.received[0]).toEqual(first.received[0]);
  });

  it.each(['completed', 'failed'] as const)(
    'delivers what the real notify activity publishes for a %s fitting',
    async (status) => {
      const { createFittingActivities } =
        await import('../../src/temporal/activities/fitting.activities.js');
      const user = await signIn(app);
      const { received } = await connect(user.cookie);
      const session = await prisma.fittingSession.create({ data: { userId: user.userId } });
      const generation = await prisma.aiGeneration.create({
        data: {
          sessionId: session.id,
          userId: user.userId,
          kind: 'look',
          fingerprint: createHash('sha256').update(randomUUID()).digest('hex'),
          status: 'processing',
          aiProvider: 'fake',
          aiModel: 'gpt-image-2',
        },
      });
      // ai and storage are not used by `complete` and `notify`.
      const activities = createFittingActivities(
        undefined as never,
        undefined as never,
        prisma,
        redis.client,
      );

      await activities.complete(
        generation.id,
        status === 'completed'
          ? { status, providerRequestId: null }
          : { status, failureCode: 'provider_error', errorMessage: 'x', providerRequestId: null },
      );
      await activities.notify(generation.id);

      await vi.waitFor(() => {
        expect(received).toHaveLength(1);
      });
      expect(received[0]).toEqual({
        event: EVENT,
        args: [{ generationId: generation.id, kind: 'look', status }],
      });
    },
  );

  it("sends nothing to another signed-in user's socket or an anonymous one", async () => {
    const owner = await signIn(app);
    const other = await signIn(app);
    const ownerSocket = await connect(owner.cookie);
    const otherSocket = await connect(other.cookie);
    const anonymous = await connect();

    await redis.client.publish(CHANNEL, message(owner.userId));

    await vi.waitFor(() => {
      expect(ownerSocket.received).toHaveLength(1);
    });
    await flush();
    expect(otherSocket.received).toEqual([]);
    expect(anonymous.received).toEqual([]);
  });

  it('drops invalid messages and goes on with the next valid one', async () => {
    const user = await signIn(app);
    const { received } = await connect(user.cookie);
    const valid = JSON.parse(message(user.userId)) as Record<string, unknown>;

    for (const bad of [
      'not json',
      '[]',
      JSON.stringify({ ...valid, imageUrl: 'https://example.com/secret' }),
      JSON.stringify({ ...valid, status: 'processing' }),
      JSON.stringify({ ...valid, kind: 'outfit' }),
      JSON.stringify({ ...valid, userId: 'not-a-uuid' }),
    ]) {
      await redis.client.publish(CHANNEL, bad);
    }
    await redis.client.publish(CHANNEL, JSON.stringify(valid));

    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });
    await flush();
    expect(received).toHaveLength(1);
    expect(received[0]?.args).toEqual([
      { generationId: valid['generationId'], kind: 'single', status: 'completed' },
    ]);
  });

  it('ignores a message on another channel', async () => {
    const user = await signIn(app);
    const { received } = await connect(user.cookie);

    await redis.client.publish('other-events', message(user.userId));
    await flush();

    expect(received).toEqual([]);
  });
});
