import { Controller, Get, type INestApplication, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Public } from '../src/common/auth/access.decorators.js';
import { Expensive } from '../src/throttling/tiered-throttler.guard.js';

// Quota tiers (spec 0006 F6, AC4-AC7). Redis points at a closed port (vitest.config.ts), so every
// counter here runs on the in-memory fallback: each 429 below holds on it (AC7). The test
// environment gives five requests per minute and 100 per second for each tier; a test that checks
// the 1-second window or one tier alone boots the app again with other limits.
@Controller('tier-costly')
@Expensive()
@Public()
class CostlyController {
  @Get()
  read(): { ok: boolean } {
    return { ok: true };
  }

  @Post()
  write(): { ok: boolean } {
    return { ok: true };
  }
}

@Controller('tier-mixed')
@Public()
class MixedController {
  @Get('plain')
  plain(): { ok: boolean } {
    return { ok: true };
  }

  @Get('costly')
  @Expensive()
  costly(): { ok: boolean } {
    return { ok: true };
  }

  @Post('plain')
  post(): { ok: boolean } {
    return { ok: true };
  }
}

const LOOSE = '1000';
const SIX = [0, 1, 2, 3, 4, 5];

describe('quota tiers (e2e)', () => {
  let app: INestApplication | undefined;

  // ConfigModule validates the process environment when the module is imported, so the app is
  // booted from freshly imported modules after the variables are stubbed.
  async function boot(env: Record<string, string> = {}): Promise<void> {
    vi.resetModules();
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { AppModule } = await import('../src/app.module.js');
    const { createHttpApp } = await import('../src/common/http/http-app.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [CostlyController, MixedController],
    }).compile();
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    await app.init();
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  type Call = () => request.Test;
  const server = (): ReturnType<INestApplication['getHttpServer']> => app?.getHttpServer();
  const get =
    (path: string): Call =>
    () =>
      request(server()).get(path);
  const post =
    (path: string): Call =>
    () =>
      request(server()).post(path);

  async function statuses(call: Call, times = 6): Promise<number[]> {
    const result: number[] = [];
    for (let i = 0; i < times; i += 1) result.push((await call()).status);
    return result;
  }

  const OK_THEN_429 = [200, 200, 200, 200, 200, 429];

  describe('past the minute limit', () => {
    it.each([
      ['read', get('/hello'), OK_THEN_429],
      ['write', post('/tier-mixed/plain'), [201, 201, 201, 201, 201, 429]],
      ['expensive', get('/tier-costly'), OK_THEN_429],
    ])('answers 429 on the %s tier', async (_tier, call, expected) => {
      await boot();

      expect(await statuses(call)).toEqual(expected);
    });

    it('answers 429 in the error format', async () => {
      await boot();
      await statuses(get('/hello'), 5);

      const response = await get('/hello')();

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
    });
  });

  describe('Retry-After on a 429', () => {
    it.each([
      ['read', get('/hello')],
      ['write', post('/tier-mixed/plain')],
      ['expensive', get('/tier-costly')],
    ])('carries a whole number of seconds up to 60 on the %s tier', async (_tier, call) => {
      await boot();
      await statuses(call, 5);

      const response = await call();

      expect(response.status).toBe(429);
      const header = String(response.headers['retry-after']);
      expect(header).toMatch(/^\d+$/);
      expect(Number(header)).toBeGreaterThan(0);
      expect(Number(header)).toBeLessThanOrEqual(60);
    });

    it('carries it on a burst 429 too', async () => {
      await boot({ THROTTLE_READ_BURST: '1', THROTTLE_READ_MINUTE: LOOSE });
      await get('/hello')();

      const response = await get('/hello')();

      expect(response.status).toBe(429);
      expect(String(response.headers['retry-after'])).toMatch(/^[1-9]\d*$/);
    });
  });

  describe('past the burst limit', () => {
    // Two requests a second with a loose minute limit: the third, sent at once, is over the burst.
    it.each([
      ['read', get('/hello'), [200, 200, 429]],
      ['write', post('/tier-mixed/plain'), [201, 201, 429]],
      ['expensive', get('/tier-costly'), [200, 200, 429]],
    ])('answers 429 on the %s tier', async (_tier, call, expected) => {
      await boot({
        THROTTLE_READ_BURST: '2',
        THROTTLE_WRITE_BURST: '2',
        THROTTLE_EXPENSIVE_BURST: '2',
        THROTTLE_READ_MINUTE: LOOSE,
        THROTTLE_WRITE_MINUTE: LOOSE,
        THROTTLE_EXPENSIVE_MINUTE: LOOSE,
      });

      expect(await statuses(call, 3)).toEqual(expected);
    });
  });

  // Spec 0006 F23: the minute window is checked before the burst one in every tier.
  describe('order of the windows', () => {
    it('tells a client over its minute quota the minute wait, even when it also exceeds the burst', async () => {
      await boot({ THROTTLE_READ_BURST: '2', THROTTLE_READ_MINUTE: '3' });
      await statuses(get('/hello'), 3);

      for (let i = 0; i < 2; i += 1) {
        const response = await get('/hello')();

        expect(response.status).toBe(429);
        const seconds = Number(String(response.headers['retry-after']));
        expect(seconds).toBeGreaterThanOrEqual(2);
        expect(seconds).toBeLessThanOrEqual(60);
      }
    });

    it('counts a request the burst refused against the minute quota', async () => {
      await boot({ THROTTLE_READ_BURST: '2', THROTTLE_READ_MINUTE: '4' });
      expect(await statuses(get('/hello'), 3)).toEqual([200, 200, 429]);

      // The only real wait here: the burst window (1 s) has to pass.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // All three counted against the minute quota of four, the refused one too: one is left, not two.
      expect(await statuses(get('/hello'), 2)).toEqual([200, 429]);
    });
  });

  describe('which tier a request counts in', () => {
    it('counts an @Expensive() GET in the expensive tier, not the read one', async () => {
      await boot({ THROTTLE_READ_MINUTE: LOOSE, THROTTLE_EXPENSIVE_MINUTE: '2' });

      expect(await statuses(get('/tier-mixed/costly'), 3)).toEqual([200, 200, 429]);
      expect(await statuses(get('/tier-mixed/plain'), 6)).toEqual([200, 200, 200, 200, 200, 200]);
    });

    it('counts @Expensive() on a controller for every method of it', async () => {
      await boot({ THROTTLE_WRITE_MINUTE: LOOSE, THROTTLE_EXPENSIVE_MINUTE: '2' });

      expect(await statuses(post('/tier-costly'), 3)).toEqual([201, 201, 429]);
    });

    it('counts a POST in the write tier only', async () => {
      await boot({ THROTTLE_READ_MINUTE: '1', THROTTLE_EXPENSIVE_MINUTE: '1' });

      expect(await statuses(post('/tier-mixed/plain'), 5)).toEqual([201, 201, 201, 201, 201]);
    });

    it('counts a plain GET in the read tier only', async () => {
      await boot({ THROTTLE_WRITE_MINUTE: '1', THROTTLE_EXPENSIVE_MINUTE: '1' });

      expect(await statuses(get('/tier-mixed/plain'), 5)).toEqual([200, 200, 200, 200, 200]);
    });

    it('counts HEAD on a GET route in the read tier, sharing the counter with GET', async () => {
      await boot({ THROTTLE_READ_MINUTE: '2' });
      const head = (): request.Test => request(server()).head('/tier-mixed/plain');

      expect((await head()).status).toBe(200);
      expect((await head()).status).toBe(200);
      expect((await get('/tier-mixed/plain')()).status).toBe(429);
      expect((await head()).status).toBe(429);
    });

    it('keeps counters per route: a used up read route does not refuse another one', async () => {
      await boot();

      expect(await statuses(get('/hello'))).toEqual(OK_THEN_429);
      expect(await statuses(get('/tier-mixed/plain'), 5)).toEqual([200, 200, 200, 200, 200]);
    });

    it('leaves GET at 200 on a route whose write quota is used up', async () => {
      await boot();

      expect(await statuses(post('/tier-mixed/plain'))).toEqual([201, 201, 201, 201, 201, 429]);
      expect(await statuses(get('/tier-mixed/plain'), 5)).toEqual([200, 200, 200, 200, 200]);
    });

    // AC4
    it('answers 429 to a client over its write quota while its reads still answer 200', async () => {
      await boot();

      expect(await statuses(post('/tier-mixed/plain'))).toEqual([201, 201, 201, 201, 201, 429]);
      const refused = await post('/tier-mixed/plain')();
      expect(refused.body).toMatchObject({ error: { code: 'TOO_MANY_REQUESTS' } });
      await get('/hello')().expect(200);
      await get('/tier-mixed/plain')().expect(200);
    });
  });

  // AC6: the rate limit runs before the access guard and the validation pipe.
  describe('refused requests', () => {
    it('count against the write quota of a closed write without a cookie', async () => {
      await boot();
      const call = (): request.Test => request(server()).post('/brands').send({});

      expect(await statuses(call)).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('count against the write quota with a cookie that is no session', async () => {
      await boot();
      const call = (): request.Test =>
        request(server()).post('/brands').set('Cookie', 'lamoda.session_token=garbage').send({});

      expect(await statuses(call)).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('count against the read quota of a closed read', async () => {
      await boot();
      const call = (): request.Test => request(server()).get('/users');

      expect(await statuses(call)).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('count against the read quota of a @SignedIn() route without a session', async () => {
      await boot();
      const call = (): request.Test => request(server()).get('/fitting-sessions');

      expect(await statuses(call)).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('do not use up the read quota when they are writes', async () => {
      await boot();
      await statuses(() => request(server()).post('/brands'), 6);

      await get('/hello')().expect(200);
    });
  });

  describe('@SkipThrottle()', () => {
    it('skips every tier: health checks never answer 429', async () => {
      await boot({ THROTTLE_READ_BURST: '1', THROTTLE_READ_MINUTE: '1' });

      const result = await Promise.all(SIX.map(() => get('/health/live')()));

      expect(result.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
    });
  });
});
