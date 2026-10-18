import { request as httpRequest, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { describe, expect, it } from 'vitest';

import { AUTH_NOT_FOUND, authRoutes } from './auth-routes.js';

function appWithRoutes() {
  const app = express();
  app.all('/api/auth/*splat', authRoutes(), (_req, res) => {
    res.json({ reached: true });
  });
  return app;
}

// The path is sent as it is (a client library may resolve `..`), with any method.
async function send(
  path: string,
  method = 'GET',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const server = createServer(appWithRoutes());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    return await new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, method }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          text += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
          });
        });
      });
      req.on('error', reject);
      req.end();
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const passes = (response: Awaited<ReturnType<typeof send>>): boolean =>
  response.status === 200 && response.body.reached === true;

describe('authRoutes', () => {
  it.each([
    ['POST', '/api/auth/sign-in/social'],
    ['GET', '/api/auth/callback/google'],
    ['GET', '/api/auth/get-session'],
    ['POST', '/api/auth/sign-out'],
    ['POST', '/api/auth/revoke-sessions'],
    ['GET', '/api/auth/ok'],
    ['GET', '/api/auth/error'],
  ])('lets %s %s through', async (method, path) => {
    expect(passes(await send(path, method))).toBe(true);
  });

  it.each([
    '/api/auth/update-user',
    '/api/auth/list-sessions',
    '/api/auth/revoke-session',
    '/api/auth/revoke-other-sessions',
    '/api/auth/list-accounts',
    '/api/auth/link-social',
    '/api/auth/get-access-token',
    '/api/auth/reset-password/abc',
    '/api/auth/sign-in/email',
    '/api/auth/oauth2/link',
    '/api/auth/callback/other',
    '/api/auth/sign-in/social/extra',
  ])('answers 404 { code, message } for %s', async (path) => {
    const response = await send(path);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Not found' });
    expect(response.body).toEqual(AUTH_NOT_FOUND);
  });

  it('refuses any method of a route that is not allowed', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      expect((await send('/api/auth/update-user', method)).status).toBe(404);
    }
  });

  describe('the path as Better Auth routes it', () => {
    it.each([
      '/api/auth/x/../sign-in/social',
      '/api/auth/x/%2e%2e/sign-in/social',
      '/api/auth/x/%2E%2E/get-session',
      '/api/auth/sign-in/./social',
    ])('lets %s through: it resolves into an allowed route', async (path) => {
      expect(passes(await send(path))).toBe(true);
    });

    it.each([
      '/api/auth/get-session/../update-user',
      '/api/auth/x/%2e%2e/list-sessions',
      '/api/auth/ok/%2e%2e/%2e%2e/auth/revoke-session',
    ])('answers 404 for %s: it resolves into a refused route', async (path) => {
      expect((await send(path)).status).toBe(404);
    });

    it('answers 404 for a trailing slash', async () => {
      expect((await send('/api/auth/get-session/')).status).toBe(404);
    });

    it.each(['/api/auth/GET-SESSION', '/api/auth/Sign-In/social', '/API/auth/get-session'])(
      'answers 404 for another letter case: %s',
      async (path) => {
        expect((await send(path)).status).toBe(404);
      },
    );

    it('ignores the query string', async () => {
      expect(passes(await send('/api/auth/get-session?disableCookieCache=true'))).toBe(true);
      expect((await send('/api/auth/update-user?x=/api/auth/get-session')).status).toBe(404);
    });
  });
});
