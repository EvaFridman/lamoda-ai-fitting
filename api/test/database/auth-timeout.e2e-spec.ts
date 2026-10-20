import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { TestApp } from '../support/test-app.js';

// The request timeout on /api/auth (spec 0013 N28), with REQUEST_TIMEOUT_MS lowered.
describe('request timeout of /api/auth (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    // ConfigModule reads the environment when AppModule is imported: stub first, import after.
    vi.stubEnv('REQUEST_TIMEOUT_MS', '200');
    // Their sum must stay under the request timeout (env.ts).
    vi.stubEnv('DATABASE_STATEMENT_TIMEOUT_MS', '80');
    vi.stubEnv('DATABASE_CONNECTION_TIMEOUT_MS', '80');
    const { createTestApp } = await import('../support/test-app.js');
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('answers 503 SERVICE_UNAVAILABLE for a slow Better Auth, without console.error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let finish: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(testApp.prisma.verification, 'create').mockImplementationOnce((async () => {
      await slow;
      throw new Error('late failure: secret-row-value');
    }) as never);

    const response = await request(testApp.app.getHttpServer())
      .post('/api/auth/sign-in/social')
      .set('Origin', 'http://localhost:3001')
      .send({ provider: 'google', callbackURL: '/catalog' });
    finish();
    // Let the late failure reach the error handler.
    await vi.waitFor(() => {
      expect(vi.mocked(testApp.prisma.verification.create)).toHaveBeenCalled();
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The request took longer than 200 ms',
    });
    expect(response.text).not.toContain('secret-row-value');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('does not delay a request that answers in time', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/api/auth/ok');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
