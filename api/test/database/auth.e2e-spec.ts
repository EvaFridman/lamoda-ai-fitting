import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { TestApp } from '../support/test-app.js';

// Sign-in with Google through Better Auth, against the fake provider (spec 0013 N14) and a real
// database. The rate limit is off here (createTestApp); test/auth-throttling.e2e-spec.ts checks it.
interface FakeOidcServer {
  issuer: { url: string };
  stop(): Promise<void>;
}
type StartFakeOidc = (options: { port?: number; host?: string }) => Promise<FakeOidcServer>;

// A variable specifier: TypeScript does not type the .mjs (no allowJs), so the module is typed here.
const modulePath = '../../scripts/fake-oidc.mjs';
const { startFakeOidc } = (await import(modulePath)) as { startFakeOidc: StartFakeOidc };

const ORIGIN = 'http://localhost:3001';
const SESSION_COOKIE = 'lamoda.session_token';
const NOT_FOUND = { code: 'NOT_FOUND', message: 'Not found' };
const DAY_MS = 24 * 60 * 60 * 1000;

function cookiesOf(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as string[] | string | undefined;
  return (Array.isArray(header) ? header : header === undefined ? [] : [header]).map(
    (cookie) => cookie.split(';')[0] ?? '',
  );
}

function setCookieOf(response: request.Response, name: string): string {
  const header = response.headers['set-cookie'] as string[] | string | undefined;
  const all = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return all.find((cookie) => cookie.startsWith(`${name}=`)) ?? '';
}

describe('sign-in with Google (e2e)', () => {
  let fake: FakeOidcServer;
  let fakeBase: string;
  let testApp: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;

  beforeAll(async () => {
    fake = await startFakeOidc({ port: 0, host: '127.0.0.1' });
    fakeBase = fake.issuer.url.replace('localhost', '127.0.0.1');
    // ConfigModule reads the environment when AppModule is imported: stub first, import after.
    vi.stubEnv('AUTH_FAKE_OIDC_URL', fakeBase);
    vi.stubEnv('AUTH_FAKE_OIDC_PUBLIC_URL', fake.issuer.url);
    const { createTestApp } = await import('../support/test-app.js');
    testApp = await createTestApp();
    server = testApp.app.getHttpServer();
  });

  afterAll(async () => {
    await testApp?.close();
    await fake?.stop();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const email = (): string => `${randomUUID()}@example.com`;

  async function startSignIn() {
    const response = await request(server)
      .post('/api/auth/sign-in/social')
      .set('Origin', ORIGIN)
      .send({ provider: 'google', callbackURL: '/catalog' });
    return { response, url: (response.body as { url?: string }).url ?? '' };
  }

  // The whole flow: the browser's start, the provider's login page and the callback.
  async function signIn(address: string, name: string, userAgent?: string) {
    const start = await startSignIn();
    const params = new URL(start.url).searchParams;
    params.set('email', address);
    params.set('name', name);
    const confirm = await fetch(`${fakeBase}/authorize/confirm?${params}`, { redirect: 'manual' });
    const callback = new URL(confirm.headers.get('location') ?? '');
    const call = request(server)
      .get(`${callback.pathname}${callback.search}`)
      .set('Cookie', cookiesOf(start.response));
    const response = await (userAgent === undefined ? call : call.set('User-Agent', userAgent));
    return { start, confirm, callback, response };
  }

  function sessionCookieOf(response: request.Response): string {
    return cookiesOf(response).find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`)) ?? '';
  }

  // Only the session token, never the session_data cookie: that forces a database read.
  function getSession(token: string): request.Test {
    return request(server).get('/api/auth/get-session').set('Cookie', token);
  }

  describe('the flow (AC1)', () => {
    it('starts at the provider and ends signed in with a user, an account and a session', async () => {
      const address = email();
      const start = await startSignIn();
      expect(start.response.status).toBe(200);
      const authorize = new URL(start.url);
      expect(`${authorize.origin}${authorize.pathname}`).toBe(`${fake.issuer.url}/authorize`);
      expect(authorize.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback/google`);

      const { confirm, callback, response } = await signIn(address, 'Ева');

      expect(confirm.status).toBe(302);
      expect(`${callback.origin}${callback.pathname}`).toBe(`${ORIGIN}/api/auth/callback/google`);
      expect(response.status).toBe(302);
      expect(new URL(response.headers.location as string, ORIGIN).pathname).toBe('/catalog');
      const token = sessionCookieOf(response);
      expect(token).not.toBe('');

      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      expect(user.firstName).toBe('Ева');
      expect(user.phone).toBeNull();
      expect(user.emailVerified).toBe(true);
      expect(user.id[14]).toBe('7');

      const accounts = await testApp.prisma.account.findMany({ where: { userId: user.id } });
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({
        providerId: 'google',
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        password: null,
      });

      const session = await getSession(token);
      expect(session.status).toBe(200);
      expect(session.body).toMatchObject({ user: { id: user.id, email: address } });
    });

    it('lower-cases the email', async () => {
      const lower = email();

      await signIn(lower.toUpperCase(), 'Ева');

      expect(await testApp.prisma.user.findUnique({ where: { email: lower } })).not.toBeNull();
    });

    it('stores null as the first name when the given name fails the name rule', async () => {
      const address = email();

      await signIn(address, 'R2D2');

      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      expect(user.firstName).toBeNull();
    });

    it('stores no avatar', async () => {
      const address = email();

      const { response } = await signIn(address, 'Ева');

      const session = await getSession(sessionCookieOf(response));
      expect(session.body.user.image ?? null).toBeNull();
    });

    it("sends an unknown provider to Better Auth's own refusal", async () => {
      const response = await request(server)
        .post('/api/auth/sign-in/social')
        .set('Origin', ORIGIN)
        .send({ provider: 'github', callbackURL: '/catalog' });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('one user per email (AC2)', () => {
    it('signs in twice into one user and one account, with two sessions', async () => {
      const address = email();

      const first = await signIn(address, 'Ева');
      const second = await signIn(address, 'Ева');

      const users = await testApp.prisma.user.findMany({ where: { email: address } });
      expect(users).toHaveLength(1);
      expect(await testApp.prisma.account.count({ where: { userId: users[0]?.id } })).toBe(1);
      expect(await testApp.prisma.session.count({ where: { userId: users[0]?.id } })).toBe(2);
      expect(sessionCookieOf(first.response)).not.toBe(sessionCookieOf(second.response));
    });
  });

  describe('the session cookie and its life (AC5)', () => {
    it('is HttpOnly, SameSite=Lax, Path=/, 30 days, and not Secure on an http origin', async () => {
      const { response } = await signIn(email(), 'Ева');

      const cookie = setCookieOf(response, SESSION_COOKIE);

      expect(cookie).toMatch(/;\s*Max-Age=2592000(;|$)/i);
      expect(cookie).toMatch(/;\s*Path=\/(;|$)/i);
      expect(cookie).toMatch(/;\s*HttpOnly(;|$)/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax(;|$)/i);
      expect(cookie).not.toMatch(/;\s*Secure/i);
    });

    it('lasts 30 days in the database', async () => {
      const before = Date.now();
      const address = email();

      await signIn(address, 'Ева');

      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      const session = await testApp.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.expiresAt.getTime() - before).toBeGreaterThan(30 * DAY_MS - 60_000);
      expect(session.expiresAt.getTime() - before).toBeLessThan(30 * DAY_MS + 60_000);
    });

    it('does not extend a session used within a day', async () => {
      const address = email();
      const { response } = await signIn(address, 'Ева');
      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      const before = await testApp.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + DAY_MS / 2);

      const result = await getSession(sessionCookieOf(response));

      expect(result.body).toMatchObject({ user: { email: address } });
      const after = await testApp.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
    });

    it('extends a session used after more than a day, to 30 days from the visit', async () => {
      const address = email();
      const { response } = await signIn(address, 'Ева');
      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      const before = await testApp.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      vi.useFakeTimers({ toFake: ['Date'] });
      const visit = Date.now() + 2 * DAY_MS;
      vi.setSystemTime(visit);

      const result = await getSession(sessionCookieOf(response));

      expect(result.body).toMatchObject({ user: { email: address } });
      const after = await testApp.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime() + DAY_MS);
      expect(Math.abs(after.expiresAt.getTime() - (visit + 30 * DAY_MS))).toBeLessThan(60_000);
    });

    it('no longer works after 30 days without a visit', async () => {
      const address = email();
      const { response } = await signIn(address, 'Ева');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 31 * DAY_MS);

      const result = await getSession(sessionCookieOf(response));

      expect(result.status).toBe(200);
      expect(result.body).toBeNull();
    });

    it('keeps working when it is used every other day for longer than 30 days', async () => {
      const { response } = await signIn(email(), 'Ева');
      const token = sessionCookieOf(response);
      vi.useFakeTimers({ toFake: ['Date'] });
      const start = Date.now();
      for (let day = 2; day <= 40; day += 2) {
        vi.setSystemTime(start + day * DAY_MS);
        expect((await getSession(token)).body).not.toBeNull();
      }
    });

    it('ends with sign-out', async () => {
      const { response } = await signIn(email(), 'Ева');
      const token = sessionCookieOf(response);

      const out = await request(server)
        .post('/api/auth/sign-out')
        .set('Origin', ORIGIN)
        .set('Cookie', token)
        .send({});
      const after = await getSession(token);

      expect(out.status).toBe(200);
      expect(after.body).toBeNull();
    });
  });

  describe('the error format (AC11)', () => {
    it("keeps Better Auth's { code, message } on /api/auth", async () => {
      const response = await request(server)
        .post('/api/auth/sign-in/social')
        .set('Origin', ORIGIN)
        .send({ provider: 'nowhere', callbackURL: '/catalog' });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toEqual({
        code: expect.any(String),
        message: expect.any(String),
      });
      expect(response.body).not.toHaveProperty('error');
    });

    it("keeps { error: { code, message, details } } on the api's own routes", async () => {
      const response = await request(server).get('/brands/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: expect.any(String),
          message: expect.any(String),
          details: expect.any(Array),
        },
      });
    });
  });

  describe('routes that answer 404 (N25)', () => {
    it('refuses update-user and leaves the name as it was', async () => {
      const address = email();
      const { response } = await signIn(address, 'Ева');

      const result = await request(server)
        .post('/api/auth/update-user')
        .set('Origin', ORIGIN)
        .set('Cookie', sessionCookieOf(response))
        .send({ name: 'Хакер' });

      expect(result.status).toBe(404);
      expect(result.body).toEqual(NOT_FOUND);
      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      expect(user.firstName).toBe('Ева');
    });

    it('refuses list-accounts', async () => {
      const { response } = await signIn(email(), 'Ева');

      const result = await request(server)
        .get('/api/auth/list-accounts')
        .set('Cookie', sessionCookieOf(response));

      expect(result.status).toBe(404);
      expect(result.body).toEqual(NOT_FOUND);
    });

    it.each([
      ['post', '/api/auth/get-access-token'],
      ['post', '/api/auth/refresh-token'],
      ['post', '/api/auth/delete-user'],
      ['post', '/api/auth/link-social'],
      ['post', '/api/auth/sign-in/email'],
      ['post', '/api/auth/sign-up/email'],
      ['get', '/api/auth/list-sessions'],
      ['post', '/api/auth/revoke-session'],
      ['post', '/api/auth/revoke-other-sessions'],
      ['get', '/api/auth/reset-password/abc'],
      ['post', '/api/auth/oauth2/link'],
    ] as const)('refuses %s %s', async (method, path) => {
      const { response } = await signIn(email(), 'Ева');

      const result = await request(server)
        [method](path)
        .set('Origin', ORIGIN)
        .set('Cookie', sessionCookieOf(response))
        .send({
          email: 'a@example.com',
          password: 'password-1234',
          name: 'Ева',
          providerId: 'google',
        });

      expect(result.status).toBe(404);
      expect(result.body).toEqual(NOT_FOUND);
    });

    it('does not list sessions through a crafted X-Forwarded-Proto on an allowed path', async () => {
      const { response } = await signIn(email(), 'Ева');

      const result = await request(server)
        .get('/api/auth/ok')
        .set('Cookie', sessionCookieOf(response))
        .set('X-Forwarded-Proto', 'http://x/api/auth/list-sessions#');

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true });
    });

    it('leaves a session alone when list-sessions is asked for it', async () => {
      const { response } = await signIn(email(), 'Ева');
      const token = sessionCookieOf(response);

      await request(server).get('/api/auth/list-sessions').set('Cookie', token);

      expect((await getSession(token)).body).not.toBeNull();
    });
  });

  describe('signing out everywhere', () => {
    it('ends every session of the user with revoke-sessions, and no other', async () => {
      const address = email();
      const first = await signIn(address, 'Ева');
      const second = await signIn(address, 'Ева');
      const other = await signIn(email(), 'Анна');

      const out = await request(server)
        .post('/api/auth/revoke-sessions')
        .set('Origin', ORIGIN)
        .set('Cookie', sessionCookieOf(first.response))
        .send({});

      expect(out.status).toBe(200);
      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      expect(await testApp.prisma.session.count({ where: { userId: user.id } })).toBe(0);
      expect((await getSession(sessionCookieOf(first.response))).body).toBeNull();
      expect((await getSession(sessionCookieOf(second.response))).body).toBeNull();
      expect((await getSession(sessionCookieOf(other.response))).body).not.toBeNull();
    });
  });

  describe('sign-in details', () => {
    it('keeps the first name when the same email signs in again with another one', async () => {
      const address = email();

      await signIn(address, 'Ева');
      await signIn(address, 'Анна');

      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      expect(user.firstName).toBe('Ева');
    });

    it('refuses a JSON body over BODY_LIMIT with 413 PAYLOAD_TOO_LARGE', async () => {
      const response = await request(server)
        .post('/api/auth/sign-in/social')
        .set('Origin', ORIGIN)
        .send({ provider: 'google', callbackURL: '/catalog', padding: 'x'.repeat(200_000) });

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The body is too large',
      });
    });

    it('refuses broken JSON with 400 BAD_REQUEST', async () => {
      const response = await request(server)
        .post('/api/auth/sign-in/social')
        .set('Origin', ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{"provider":');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid JSON in request body',
      });
    });

    it('refuses a sign-in body that is not JSON with 415', async () => {
      const response = await request(server)
        .post('/api/auth/sign-in/social')
        .set('Origin', ORIGIN)
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify({ provider: 'google', callbackURL: '/catalog' }));

      expect(response.status).toBe(415);
      expect(response.body).toEqual({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Only JSON bodies are accepted',
      });
    });

    it('refuses an application/json5 body over BODY_LIMIT with 413', async () => {
      const response = await request(server)
        .post('/api/auth/sign-in/social')
        .set('Origin', ORIGIN)
        .set('Content-Type', 'application/json5')
        .send(JSON.stringify({ provider: 'google', padding: 'x'.repeat(200_000) }));

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The body is too large',
      });
    });

    it('still lets a sign-out without a body through', async () => {
      const { response } = await signIn(email(), 'Ева');

      const out = await request(server)
        .post('/api/auth/sign-out')
        .set('Origin', ORIGIN)
        .set('Cookie', sessionCookieOf(response));

      expect(out.status).toBe(200);
    });

    // The fake provider confirms, then the callback comes with the cookies given.
    async function callbackWith(cookies: (start: string[]) => string[]) {
      const start = await startSignIn();
      const params = new URL(start.url).searchParams;
      params.set('email', email());
      params.set('name', 'Ева');
      const confirm = await fetch(`${fakeBase}/authorize/confirm?${params}`, {
        redirect: 'manual',
      });
      const callback = new URL(confirm.headers.get('location') ?? '');
      return request(server)
        .get(`${callback.pathname}${callback.search}`)
        .set('Cookie', cookies(cookiesOf(start.response)));
    }

    it.each([
      ['no state cookie', (cookies: string[]) => cookies.filter((c) => !c.includes('state'))],
      [
        'a wrong state cookie',
        (cookies: string[]) =>
          cookies.map((c) => (c.includes('state') ? `${c.split('=')[0]}=forged` : c)),
      ],
    ])('refuses the callback with %s and creates no session', async (_label, change) => {
      const sessions = await testApp.prisma.session.count();

      const response = await callbackWith(change);

      expect(response.status).toBe(302);
      const location = new URL(response.headers.location as string, ORIGIN);
      expect(location.pathname).toBe('/api/auth/error');
      expect(location.searchParams.get('error')).toBe('state_mismatch');
      expect(sessionCookieOf(response)).toBe('');
      expect(await testApp.prisma.session.count()).toBe(sessions);
    });
  });

  describe('a database failure (N26)', () => {
    it('answers 500 { code, message } and prints nothing with console.error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(testApp.prisma.verification, 'create').mockRejectedValueOnce(
        new Error('connection lost: secret-row-value'),
      );

      const response = await request(server)
        .post('/api/auth/sign-in/social')
        .set('Origin', ORIGIN)
        .send({ provider: 'google', callbackURL: '/catalog' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
      expect(response.text).not.toContain('secret-row-value');
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('the session row', () => {
    it('stores a User-Agent longer than 512 characters cut to 512', async () => {
      const address = email();

      const { response } = await signIn(address, 'Ева', 'u'.repeat(700));

      expect(response.status).toBe(302);
      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      const session = await testApp.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.userAgent).toBe('u'.repeat(512));
    });

    it('stores a short User-Agent as sent', async () => {
      const address = email();

      await signIn(address, 'Ева', 'Mozilla/5.0 test');

      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { email: address } });
      const session = await testApp.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.userAgent).toBe('Mozilla/5.0 test');
    });
  });
});
