import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PROXY_SECRET_NEXT (spec 0006 F21) goes through the real configuration: ConfigModule validates the
// process environment when the module is imported, so each app is booted from freshly imported
// modules after the variables are stubbed. THROTTLE_LIMIT=5 comes from vitest.config.ts.
const OLD = 'testproxysecret0123456789abcdef0';
const NEXT = 'nextproxysecret0123456789abcdef1';
const SENT_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

describe('proxy secret rotation (e2e)', () => {
  let app: INestApplication | undefined;

  async function boot(env: Record<string, string>): Promise<void> {
    vi.resetModules();
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { AppModule } = await import('../src/app.module.js');
    const { AppExpressAdapter } = await import('../src/common/http/app-express.adapter.js');
    const { useRequestContext } = await import('../src/common/http/request-context.js');
    const { createValidationPipe } = await import('../src/common/validation/validation-pipe.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(new AppExpressAdapter(), { logger: false });
    useRequestContext(app);
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  }

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  async function requestId(headers: Record<string, string>): Promise<string> {
    const response = await request(app?.getHttpServer()).get('/hello').set(headers).expect(200);
    return response.headers['x-request-id'] as string;
  }

  // Six distinct addresses fit the limit of five only when each is counted on its own.
  async function statuses(secret: string): Promise<number[]> {
    const result: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await request(app?.getHttpServer())
        .get('/hello')
        .set({ 'X-Proxy-Secret': secret, 'X-Forwarded-For': `203.0.113.${i + 1}` });
      result.push(response.status);
    }
    return result;
  }

  describe('both secrets set', () => {
    beforeEach(async () => {
      await boot({ PROXY_SECRET: OLD, PROXY_SECRET_NEXT: NEXT });
    });

    it.each([
      ['old', OLD],
      ['next', NEXT],
    ])('takes the request id of a request with the %s secret', async (_name, secret) => {
      expect(await requestId({ 'X-Proxy-Secret': secret, 'X-Request-Id': SENT_ID })).toBe(SENT_ID);
    });

    it.each([
      ['old', OLD],
      ['next', NEXT],
    ])('counts each forwarded address on its own with the %s secret', async (_name, secret) => {
      expect(await statuses(secret)).toEqual([200, 200, 200, 200, 200, 200]);
    });

    it('ignores the request id of a request with a wrong secret', async () => {
      const id = await requestId({ 'X-Proxy-Secret': 'wrong', 'X-Request-Id': SENT_ID });

      expect(id).toMatch(UUID);
    });

    it('shares one quota between requests with a wrong secret', async () => {
      expect(await statuses('wrong')).toEqual([200, 200, 200, 200, 200, 429]);
    });
  });

  describe('only PROXY_SECRET_NEXT set', () => {
    beforeEach(async () => {
      await boot({ PROXY_SECRET: '', PROXY_SECRET_NEXT: NEXT });
    });

    it('trusts the next secret', async () => {
      expect(await requestId({ 'X-Proxy-Secret': NEXT, 'X-Request-Id': SENT_ID })).toBe(SENT_ID);
    });

    it('trusts nothing else, not even an empty header', async () => {
      expect(await requestId({ 'X-Proxy-Secret': OLD, 'X-Request-Id': SENT_ID })).toMatch(UUID);
      expect(await requestId({ 'X-Proxy-Secret': '', 'X-Request-Id': SENT_ID })).toMatch(UUID);
      expect(await requestId({ 'X-Request-Id': SENT_ID })).toMatch(UUID);
    });
  });

  describe('only PROXY_SECRET set', () => {
    beforeEach(async () => {
      await boot({ PROXY_SECRET: OLD, PROXY_SECRET_NEXT: '' });
    });

    it('trusts the old secret and not the next one', async () => {
      expect(await requestId({ 'X-Proxy-Secret': OLD, 'X-Request-Id': SENT_ID })).toBe(SENT_ID);
      expect(await requestId({ 'X-Proxy-Secret': NEXT, 'X-Request-Id': SENT_ID })).toMatch(UUID);
    });
  });
});
