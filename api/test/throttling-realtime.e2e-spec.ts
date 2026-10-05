import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { SocketIoAdapter } from '../src/realtime/socket-io.adapter.js';

// Redis points at a closed port (vitest.config.ts), so the request counters run on the in-memory
// fallback: the limit must still hold. THROTTLE_LIMIT is 5 in the test environment.
describe('throttling and websockets (e2e)', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
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
