import { request as httpRequest, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ThrottlerStorage } from '@nestjs/throttler';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PROXY_SECRET_HEADER, requestContextMiddleware } from '../common/http/request-context.js';
import { authThrottle, type TierLimits } from './auth-throttle.js';

const SECRET = 'testproxysecret0123456789abcdef0';

interface Call {
  key: string;
  ttl: number;
  limit: number;
  name: string;
}

// Counts per key like the real storage, and blocks past the limit with the window's wait.
function fakeStorage() {
  const calls: Call[] = [];
  const counts = new Map<string, number>();
  const storage: Pick<ThrottlerStorage, 'increment'> = {
    increment: (key, ttl, limit, _blockDuration, name) => {
      calls.push({ key, ttl, limit, name });
      const hits = (counts.get(key) ?? 0) + 1;
      counts.set(key, hits);
      return Promise.resolve({
        totalHits: hits,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: hits > limit,
        timeToBlockExpire: hits > limit ? Math.ceil(ttl / 1000) : 0,
      });
    },
  };
  return { storage, calls };
}

const LIMITS: TierLimits = {
  read: { burst: 100, minute: 3 },
  write: { burst: 100, minute: 2 },
  expensive: { burst: 100, minute: 1 },
};

function appWith(storage: Pick<ThrottlerStorage, 'increment'>, limits: TierLimits = LIMITS) {
  const app = express();
  app.use(requestContextMiddleware({ proxySecret: SECRET }));
  app.all('/api/auth/*splat', authThrottle(storage, limits), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

async function rawPost(app: express.Express, path: string): Promise<number> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    return await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, method: 'POST' }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('authThrottle', () => {
  describe('tier of a request', () => {
    it.each([
      ['GET', 'get', '/api/auth/get-session', 'read'],
      ['HEAD', 'head', '/api/auth/get-session', 'read'],
      ['POST sign-in', 'post', '/api/auth/sign-in/social', 'expensive'],
      ['POST sign-in in another case', 'post', '/api/auth/SIGN-IN/social', 'expensive'],
      ['POST sign-out', 'post', '/api/auth/sign-out', 'write'],
      ['POST of another path', 'post', '/api/auth/update-user', 'write'],
      ['GET of a sign-in path', 'get', '/api/auth/sign-in/social', 'read'],
    ] as const)('counts %s in the %s tier', async (_label, method, path, tier) => {
      const { storage, calls } = fakeStorage();

      await request(appWith(storage))[method](path);

      expect(calls.map((call) => call.name)).toEqual([`${tier}-minute`, `${tier}-burst`]);
    });

    // A client library may tidy the path, so it is sent as it is with node:http.
    it.each([
      ['a `..` segment', '/api/auth/x/../sign-in/social'],
      ['an encoded `..` segment', '/api/auth/x/%2e%2e/sign-in/social'],
      ['an encoded `..` segment in capitals', '/api/auth/x/%2E%2E/SIGN-IN/social'],
    ])('counts a POST sign-in behind %s in the expensive tier', async (_label, path) => {
      const { storage, calls } = fakeStorage();

      await rawPost(appWith(storage), path);

      expect(calls.map((call) => call.name)).toEqual(['expensive-minute', 'expensive-burst']);
    });

    it('counts a POST that `..` resolves out of sign-in in the write tier', async () => {
      const { storage, calls } = fakeStorage();

      await rawPost(appWith(storage), '/api/auth/sign-in/../sign-out');

      expect(calls.map((call) => call.name)).toEqual(['write-minute', 'write-burst']);
    });

    it('counts a PUT and a DELETE in the write tier', async () => {
      const { storage, calls } = fakeStorage();
      const app = appWith(storage);

      await request(app).put('/api/auth/anything');
      await request(app).delete('/api/auth/anything');

      expect(new Set(calls.map((call) => call.name))).toEqual(
        new Set(['write-minute', 'write-burst']),
      );
    });
  });

  describe('counters', () => {
    it('keeps one counter per tier for every path, not one per path', async () => {
      const { storage, calls } = fakeStorage();
      const app = appWith(storage);

      await request(app).get('/api/auth/get-session');
      await request(app).get('/api/auth/ok');
      await request(app).get('/api/auth/random-path-1');

      const minuteKeys = new Set(
        calls.filter((call) => call.name === 'read-minute').map((call) => call.key),
      );
      expect(minuteKeys.size).toBe(1);
    });

    it('uses different counters for the tiers and for the windows', async () => {
      const { storage, calls } = fakeStorage();
      const app = appWith(storage);

      await request(app).get('/api/auth/get-session');
      await request(app).post('/api/auth/sign-out');
      await request(app).post('/api/auth/sign-in/social');

      expect(new Set(calls.map((call) => call.key)).size).toBe(6);
    });

    it('counts per client address', async () => {
      const { storage, calls } = fakeStorage();
      const app = appWith(storage);
      const from = (address: string) =>
        request(app)
          .get('/api/auth/get-session')
          .set(PROXY_SECRET_HEADER, SECRET)
          .set('X-Forwarded-For', address);

      await from('203.0.113.1');
      await from('203.0.113.2');

      const minuteKeys = calls.filter((call) => call.name === 'read-minute').map((c) => c.key);
      expect(minuteKeys).toHaveLength(2);
      expect(minuteKeys[0]).not.toBe(minuteKeys[1]);
    });

    it('does not trust X-Forwarded-For without the proxy secret', async () => {
      const { storage, calls } = fakeStorage();
      const app = appWith(storage);

      await request(app).get('/api/auth/get-session').set('X-Forwarded-For', '203.0.113.1');
      await request(app).get('/api/auth/get-session').set('X-Forwarded-For', '203.0.113.2');

      const minuteKeys = calls.filter((call) => call.name === 'read-minute').map((c) => c.key);
      expect(minuteKeys[0]).toBe(minuteKeys[1]);
    });

    it('passes the window length and the tier limit to the storage', async () => {
      const { storage, calls } = fakeStorage();

      await request(appWith(storage)).post('/api/auth/sign-in/social');

      expect(calls).toMatchObject([
        { name: 'expensive-minute', ttl: 60_000, limit: 1 },
        { name: 'expensive-burst', ttl: 1000, limit: 100 },
      ]);
    });
  });

  describe('past the limit', () => {
    it('lets the requests up to the limit through and then answers 429', async () => {
      const { storage } = fakeStorage();
      const app = appWith(storage);

      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        statuses.push((await request(app).get(`/api/auth/path-${i}`)).status);
      }

      expect(statuses).toEqual([200, 200, 200, 429]);
    });

    it('answers in the api error format with Retry-After', async () => {
      const { storage } = fakeStorage();
      const app = appWith(storage);
      await request(app).post('/api/auth/sign-in/social');

      const response = await request(app).post('/api/auth/sign-in/social');

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
      expect(response.body).toMatchObject({
        error: { code: 'TOO_MANY_REQUESTS', details: [] },
      });
    });

    it('does not reach the handler of a refused request', async () => {
      const { storage } = fakeStorage();
      const app = appWith(storage);
      await request(app).post('/api/auth/sign-in/social');

      const response = await request(app).post('/api/auth/sign-in/social');

      expect(response.body).not.toHaveProperty('ok');
    });

    it('leaves the read tier open when the expensive one is used up', async () => {
      const { storage } = fakeStorage();
      const app = appWith(storage);
      await request(app).post('/api/auth/sign-in/social');
      await request(app).post('/api/auth/sign-in/social');

      expect((await request(app).get('/api/auth/get-session')).status).toBe(200);
    });

    it('checks the minute window before the burst one and tells the minute wait', async () => {
      const { storage, calls } = fakeStorage();
      const limits: TierLimits = { ...LIMITS, read: { burst: 1, minute: 1 } };
      const app = appWith(storage, limits);
      await request(app).get('/api/auth/get-session');

      const response = await request(app).get('/api/auth/get-session');

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
      expect(calls.slice(2).map((call) => call.name)).toEqual(['read-minute']);
    });

    it('tells the burst wait when only the burst window is over', async () => {
      const { storage } = fakeStorage();
      const limits: TierLimits = { ...LIMITS, read: { burst: 1, minute: 100 } };
      const app = appWith(storage, limits);
      await request(app).get('/api/auth/get-session');

      const response = await request(app).get('/api/auth/get-session');

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('1');
    });
  });
});
