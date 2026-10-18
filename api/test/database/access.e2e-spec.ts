import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AUTH } from '../../src/auth/auth.module.js';
import type { Auth } from '../../src/auth/auth.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { signIn, type SignedIn } from '../support/sign-in.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

type Method = 'get' | 'post' | 'patch' | 'delete';

const id = () => randomUUID();

// The catalog writes (one or more per controller), every route of /users and the writes of
// generations: closed to everyone (spec 0013 N8).
const closedRoutes: [Method, string][] = [
  ['post', '/categories'],
  ['patch', `/categories/${id()}`],
  ['delete', `/categories/${id()}`],
  ['post', '/brands'],
  ['patch', `/brands/${id()}`],
  ['delete', `/brands/${id()}`],
  ['post', '/attributes'],
  ['patch', `/attributes/${id()}`],
  ['delete', `/attributes/${id()}`],
  ['post', `/attributes/${id()}/values`],
  ['patch', `/attributes/${id()}/values/${id()}`],
  ['delete', `/attributes/${id()}/values/${id()}`],
  ['post', '/products'],
  ['patch', `/products/${id()}`],
  ['delete', `/products/${id()}`],
  ['post', `/products/${id()}/variations`],
  ['patch', `/products/${id()}/variations/${id()}`],
  ['delete', `/products/${id()}/variations/${id()}`],
  ['post', `/products/${id()}/images`],
  ['patch', `/products/${id()}/images/${id()}`],
  ['delete', `/products/${id()}/images/${id()}`],
  ['post', `/products/${id()}/attribute-values`],
  ['delete', `/products/${id()}/attribute-values/${id()}`],
  ['get', '/users'],
  ['get', `/users/${id()}`],
  ['post', '/users'],
  ['patch', `/users/${id()}`],
  ['delete', `/users/${id()}`],
  ['post', '/ai-generations'],
  ['patch', `/ai-generations/${id()}`],
];

const signedInRoutes: [Method, string][] = [
  ['get', '/fitting-sessions'],
  ['get', `/fitting-sessions/${id()}`],
  ['post', '/fitting-sessions'],
  ['patch', `/fitting-sessions/${id()}`],
  ['delete', `/fitting-sessions/${id()}`],
  ['get', '/ai-generations'],
  ['get', `/ai-generations/${id()}`],
  ['delete', `/ai-generations/${id()}`],
];

const publicReads = [
  '/categories',
  '/brands',
  '/attributes',
  '/products',
  '/products/facets',
  '/health/live',
];

// The whole app with the real access guard, not createTestApp()'s (spec 0013 AC7, AC9): that app
// lets a signed-in user through @Closed() routes, this one is built the way production is.
describe('access through the whole app (database e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let user: SignedIn;

  function send(method: Method, path: string, cookie?: string): request.Test {
    const call = request(app.getHttpServer())[method](path);
    if (method === 'post' || method === 'patch') call.send({});
    return cookie === undefined ? call : call.set('Cookie', cookie);
  }

  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ access: 'production' });
    app = testApp.app;
    prisma = testApp.prisma;
    user = await signIn(app);
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('@SignedIn() routes', () => {
    it.each(signedInRoutes)('answers %s %s 401 without a cookie', async (method, path) => {
      const response = await send(method, path);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { code: 'UNAUTHORIZED', message: 'Sign-in required', details: [] },
      });
    });

    it.each(signedInRoutes)('answers %s %s 401 with a garbage cookie', async (method, path) => {
      const response = await send(method, path, 'lamoda.session_token=garbage');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    });

    it.each(signedInRoutes)('lets %s %s past the guard with a session', async (method, path) => {
      const response = await send(method, path, user.cookie);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(500);
    });

    it('answers the lists 200 and an unknown id 404 with a session', async () => {
      await send('get', '/fitting-sessions', user.cookie).expect(200);
      await send('get', '/ai-generations', user.cookie).expect(200);
      await send('get', `/fitting-sessions/${id()}`, user.cookie).expect(404);
      await send('delete', `/fitting-sessions/${id()}`, user.cookie).expect(404);
      await send('get', `/ai-generations/${id()}`, user.cookie).expect(404);
      await send('delete', `/ai-generations/${id()}`, user.cookie).expect(404);
    });

    it('answers 401 with a cookie whose signature is wrong', async () => {
      const [name, raw] = user.cookie.split('=') as [string, string];
      const [token] = decodeURIComponent(raw).split('.') as [string];
      const forged = `${name}=${encodeURIComponent(`${token}.${'A'.repeat(43)}=`)}`;

      await send('get', '/fitting-sessions', forged).expect(401);
    });

    it('answers 401 with a signed cookie of a session the database does not know', async () => {
      const other = await signIn(app);
      await prisma.session.delete({ where: { id: other.sessionId } });

      await send('get', '/fitting-sessions', other.cookie).expect(401);
    });

    it('treats an expired session as anonymous', async () => {
      const expired = await signIn(app);
      await send('get', '/fitting-sessions', expired.cookie).expect(200);
      await prisma.session.update({
        where: { id: expired.sessionId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const response = await send('get', '/fitting-sessions', expired.cookie);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    });
  });

  describe('cookies and the order of checks', () => {
    it('treats the session-data cookie alone as anonymous', async () => {
      const fresh = await signIn(app);
      const session = await send('get', '/api/auth/get-session', fresh.cookie);
      const setCookies = [session.headers['set-cookie'] ?? []].flat();
      const data = setCookies.find((line) => line.startsWith('lamoda.session_data='));
      expect(data).toBeDefined();
      const dataCookie = (data as string).split(';')[0] as string;

      await send('get', '/fitting-sessions', fresh.cookie).expect(200);
      const response = await send('get', '/fitting-sessions', dataCookie);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    });

    it.each([
      ['an empty body', {}],
      ['an invalid body', { name: 123, unknown: true }],
    ])('answers a closed route 401, not 400, for %s', async (_label, body) => {
      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Cookie', user.cookie)
        .send(body);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    });

    it('answers broken JSON 400 BAD_JSON before the guard on a signed-in route', async () => {
      const response = await request(app.getHttpServer())
        .post('/fitting-sessions')
        .set('Content-Type', 'application/json')
        .send('{bad');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'BAD_JSON' } });
    });

    it('sets X-Request-Id on a 401 without a session and on a 401 of a closed route', async () => {
      const anonymous = await send('get', '/fitting-sessions');
      const closed = await send('post', '/categories', user.cookie);

      expect(anonymous.status).toBe(401);
      expect(anonymous.headers['x-request-id']).toBeTruthy();
      expect(closed.status).toBe(401);
      expect(closed.headers['x-request-id']).toBeTruthy();
    });

    it('reads the first of two session-token cookies: garbage first is 401', async () => {
      const valid = user.cookie.split('=')[1] as string;

      const response = await send(
        'get',
        '/fitting-sessions',
        `lamoda.session_token=garbage; lamoda.session_token=${valid}`,
      );

      expect(response.status).toBe(401);
    });

    it('reads the first of two session-token cookies: a valid one first passes', async () => {
      await send('get', '/fitting-sessions', `${user.cookie}; lamoda.session_token=garbage`).expect(
        200,
      );
    });
  });

  describe('when the session read fails', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each(['/categories', '/fitting-sessions'])(
      'answers GET %s 503 in the error envelope with a cookie',
      async (path) => {
        vi.spyOn(app.get<Auth>(AUTH).api, 'getSession').mockRejectedValue(new Error('db down'));

        const response = await send('get', path, user.cookie);

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
        expect(response.headers['x-request-id']).toBeTruthy();
        expect(response.text).not.toContain('db down');
        expect(response.text).not.toMatch(/\bat .*\(/);
      },
    );

    it.each(['/categories', '/fitting-sessions'])(
      'answers GET %s 503 when the session read never settles',
      async (path) => {
        vi.spyOn(app.get<Auth>(AUTH).api, 'getSession').mockReturnValue(
          new Promise(() => undefined),
        );

        const response = await send('get', path, user.cookie);

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
        expect(response.headers['x-request-id']).toBeTruthy();
        expect(response.text).not.toMatch(/\bat .*\(/);
      },
      10_000,
    );

    it('still serves GET /categories with only an unrelated cookie, without a session read', async () => {
      const spy = vi
        .spyOn(app.get<Auth>(AUTH).api, 'getSession')
        .mockRejectedValue(new Error('db down'));

      await send('get', '/categories', 'cookie-consent=yes').expect(200);

      expect(spy).not.toHaveBeenCalled();
    });

    it('still serves GET /categories without a cookie and does not read the session', async () => {
      const spy = vi
        .spyOn(app.get<Auth>(AUTH).api, 'getSession')
        .mockRejectedValue(new Error('db down'));

      await send('get', '/categories').expect(200);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('@Closed() routes', () => {
    it.each(closedRoutes)('answers %s %s 401 without a cookie', async (method, path) => {
      const response = await send(method, path);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { code: 'UNAUTHORIZED', message: 'The route is closed', details: [] },
      });
    });

    it.each(closedRoutes)('answers %s %s 401 with a session too', async (method, path) => {
      const response = await send(method, path, user.cookie);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { code: 'UNAUTHORIZED', message: 'The route is closed', details: [] },
      });
    });

    it('does not create a brand for a signed-in user', async () => {
      const name = `Closed brand ${randomUUID()}`;

      await request(app.getHttpServer())
        .post('/brands')
        .set('Cookie', user.cookie)
        .send({ name })
        .expect(401);

      expect(await prisma.brand.count({ where: { name } })).toBe(0);
    });

    it('ignores the retired X-Admin-Token header', async () => {
      await request(app.getHttpServer()).get('/users').set('X-Admin-Token', 'anything').expect(401);
    });
  });

  describe('@Public() routes', () => {
    it.each(publicReads)(
      'serves GET %s with no cookie, a garbage one, a forged one and a session',
      async (path) => {
        const [name, raw] = user.cookie.split('=') as [string, string];
        const [token] = decodeURIComponent(raw).split('.') as [string];
        const forged = `${name}=${encodeURIComponent(`${token}.${'A'.repeat(43)}=`)}`;

        await send('get', path).expect(200);
        await send('get', path, 'lamoda.session_token=garbage').expect(200);
        await send('get', path, forged).expect(200);
        await send('get', path, user.cookie).expect(200);
      },
    );

    it('serves a nested catalog read: 404 for an unknown id, not 401', async () => {
      const response = await send('get', `/products/${id()}/variations/${id()}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });
  });

  it.each(['/nope', '/nope/users', '/users/a/b/c'])(
    'answers GET %s 404 in the error format, not 401',
    async (path) => {
      const response = await send('get', path);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
    },
  );
});
