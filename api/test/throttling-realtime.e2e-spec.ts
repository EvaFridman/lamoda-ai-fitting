import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { useRequestContext } from '../src/common/http/request-context.js';
import { SocketIoAdapter } from '../src/realtime/socket-io.adapter.js';

// Redis points at a closed port (vitest.config.ts), so the request counters run on the in-memory
// fallback: the limit must still hold. Five requests per route and tier in the test environment;
// test/throttling-tiers.e2e-spec.ts checks each tier on that fallback too.
describe('throttling and websockets (e2e)', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    useRequestContext(app);
    app.useWebSocketAdapter(new SocketIoAdapter(app, 'http://localhost:3001'));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 429 once a client goes over the limit, even with Redis down', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await request(app.getHttpServer()).get('/hello')).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  // The rate limit runs before the access guard (spec 0006 F5, AC6), so guessing the admin token
  // runs into the limit like any other request.
  it('counts requests with a wrong admin token and answers 429 over the limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push(
        (await request(app.getHttpServer()).get('/users').set('X-Admin-Token', 'wrong')).status,
      );
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('never limits health checks', async () => {
    for (let i = 0; i < 8; i += 1) {
      await request(app.getHttpServer()).get('/health/live').expect(200);
    }
  });

  it('answers a websocket ping with pong', async () => {
    const socket: Socket = io(url, { transports: ['websocket'], reconnection: false });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      await expect(socket.timeout(2000).emitWithAck('ping')).resolves.toBe('pong');
    } finally {
      socket.close();
    }
  });
});
