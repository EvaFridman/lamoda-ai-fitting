import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface FakeOidcServer {
  issuer: { url: string };
  stop(): Promise<void>;
}
type StartFakeOidc = (options: {
  port?: number;
  host?: string;
  issuer?: string;
}) => Promise<FakeOidcServer>;

// A variable specifier: TypeScript does not type the .mjs (no allowJs), so the module is typed here.
const modulePath = '../scripts/fake-oidc.mjs';
const { startFakeOidc } = (await import(modulePath)) as { startFakeOidc: StartFakeOidc };

const REDIRECT = 'http://localhost:3001/api/auth/callback/google';
const REFUSED_TEXT = 'redirect_uri must be an http(s) address on localhost or 127.0.0.1';

describe('fake OpenID provider', () => {
  let server: FakeOidcServer;
  let base: string;

  beforeAll(async () => {
    server = await startFakeOidc({ port: 0, host: '127.0.0.1' });
    base = server.issuer.url.replace('localhost', '127.0.0.1');
  });

  afterAll(async () => {
    await server.stop();
  });

  function confirm(params: Record<string, string>): Promise<Response> {
    const query = new URLSearchParams({
      client_id: 'client',
      redirect_uri: REDIRECT,
      response_type: 'code',
      state: 'state-1',
      nonce: 'nonce-1',
      scope: 'openid email profile',
      ...params,
    });
    return fetch(`${base}/authorize/confirm?${query}`, { redirect: 'manual' });
  }

  async function signIn(email: string, name: string) {
    const response = await confirm({ email, name });
    const location = new URL(response.headers.get('location') ?? '');
    return { response, location };
  }

  async function exchange(code: string) {
    const response = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: 'client',
        client_secret: 'secret',
        redirect_uri: REDIRECT,
      }),
    });
    return (await response.json()) as { access_token: string; id_token: string };
  }

  function payloadOf(jwt: string): Record<string, unknown> {
    const part = jwt.split('.')[1] ?? '';
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  }

  async function userinfo(token: string): Promise<Response> {
    return fetch(`${base}/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  }

  it('shows a login form with the query parameters as escaped hidden fields and a CSP', async () => {
    const hostile = '"><script>alert(1)</script>';
    const query = new URLSearchParams({ state: hostile, redirect_uri: REDIRECT, nonce: 'n-1' });

    const response = await fetch(`${base}/authorize?${query}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).not.toContain('form-action');
    expect(html).toContain('action="/authorize/confirm"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="name"');
    expect(html).toContain('name="nonce" value="n-1"');
    expect(html).toContain('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).not.toContain('<script>');
  });

  it('puts the discovery authorization_endpoint at <issuer>/authorize', async () => {
    const custom = await startFakeOidc({ port: 0, host: '127.0.0.1', issuer: 'http://auth.test' });
    try {
      const port = new URL(custom.issuer.url).port;
      expect(custom.issuer.url).toBe('http://auth.test');
      expect(port).toBe('');
    } finally {
      await custom.stop();
    }

    const response = await fetch(`${base}/.well-known/openid-configuration`);
    const discovery = (await response.json()) as { authorization_endpoint: string };

    expect(discovery.authorization_endpoint).toBe(`${server.issuer.url}/authorize`);
  });

  it('redirects with a code and the state, and issues tokens that carry the typed claims', async () => {
    const { response, location } = await signIn('Ann.Smith@Example.com', ' Ann ');

    expect(response.status).toBe(302);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
    expect(location.searchParams.get('state')).toBe('state-1');
    expect(location.searchParams.get('error')).toBeNull();
    const code = location.searchParams.get('code') ?? '';
    expect(code).not.toBe('');

    const tokens = await exchange(code);
    const claims = {
      sub: 'ann.smith@example.com',
      email: 'ann.smith@example.com',
      email_verified: true,
      given_name: 'Ann',
      name: 'Ann',
    };

    expect(payloadOf(tokens.id_token)).toMatchObject({ ...claims, nonce: 'nonce-1' });
    expect(payloadOf(tokens.access_token)).toMatchObject(claims);

    const info = await userinfo(tokens.access_token);
    expect(info.status).toBe(200);
    expect(await info.json()).toEqual(claims);
  });

  it('gives the same sub to the same email in any case, and another sub to another email', async () => {
    const first = await exchange(
      (await signIn('Same@Example.com', 'One')).location.searchParams.get('code') ?? '',
    );
    const second = await exchange(
      (await signIn('same@example.com', 'Two')).location.searchParams.get('code') ?? '',
    );
    const other = await exchange(
      (await signIn('other@example.com', 'Two')).location.searchParams.get('code') ?? '',
    );

    expect(payloadOf(first.id_token).sub).toBe('same@example.com');
    expect(payloadOf(second.id_token).sub).toBe('same@example.com');
    expect(payloadOf(other.id_token).sub).toBe('other@example.com');
  });

  it.each([
    ['no email', { name: 'Ann' }],
    ['an empty email', { email: '', name: 'Ann' }],
    ['an invalid email', { email: 'not-an-email', name: 'Ann' }],
    ['no name', { email: 'a@example.com' }],
    ['a blank name', { email: 'a@example.com', name: '   ' }],
  ])('refuses %s with access_denied, no code and the state kept', async (_name, params) => {
    const response = await confirm(params);
    const location = new URL(response.headers.get('location') ?? '');

    expect(response.status).toBe(302);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('code')).toBeNull();
    expect(location.searchParams.get('state')).toBe('state-1');
  });

  function postToken(params: Record<string, string>): Promise<Response> {
    return fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'client',
        client_secret: 'secret',
        redirect_uri: REDIRECT,
        ...params,
      }),
    });
  }

  it.each([
    ['a code that was never issued', { code: 'zzz' }],
    ['no code', {}],
  ])('answers 400 invalid_grant to /token with %s, and issues no tokens', async (_name, params) => {
    const response = await postToken(params);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_grant');
    expect(body).not.toHaveProperty('access_token');
    expect(body).not.toHaveProperty('id_token');
  });

  it.each(['refresh_token', 'password', 'client_credentials'])(
    'answers 400 unsupported_grant_type to /token with grant_type %s, and issues no tokens',
    async (grantType) => {
      const response = await postToken({
        grant_type: grantType,
        refresh_token: 'r',
        username: 'u',
        password: 'p',
      });
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(400);
      expect(body.error).toBe('unsupported_grant_type');
      expect(body).not.toHaveProperty('access_token');
      expect(body).not.toHaveProperty('id_token');
    },
  );

  it('answers 400 invalid_grant when a code is exchanged a second time', async () => {
    const code = (await signIn('once@example.com', 'Once')).location.searchParams.get('code') ?? '';

    const first = await postToken({ code });
    const second = await postToken({ code });
    const body = (await second.json()) as Record<string, unknown>;

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(body.error).toBe('invalid_grant');
    expect(body).not.toHaveProperty('access_token');
  });

  it('puts no nonce into the id token when none was sent', async () => {
    const query = new URLSearchParams({
      client_id: 'client',
      redirect_uri: REDIRECT,
      response_type: 'code',
      state: 'state-1',
      email: 'nonce@example.com',
      name: 'Nonce',
    });
    const response = await fetch(`${base}/authorize/confirm?${query}`, { redirect: 'manual' });
    const code = new URL(response.headers.get('location') ?? '').searchParams.get('code') ?? '';

    const tokens = await exchange(code);

    expect(payloadOf(tokens.id_token)).not.toHaveProperty('nonce');
  });

  it.each([
    ['a name of only spaces', 'a@example.com', '     '],
    ['an email over 250 characters', `${'a'.repeat(250)}@example.com`, 'Ann'],
  ])('refuses %s with access_denied and the state kept', async (_name, email, name) => {
    const { location } = await signIn(email, name);

    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('code')).toBeNull();
    expect(location.searchParams.get('state')).toBe('state-1');
  });

  it.each([
    ['missing', undefined],
    ['unparseable', 'not a url'],
    ['a javascript: address', 'javascript:alert(1)'],
    ['another host', 'http://evil.example/cb'],
    ['a look-alike host', 'http://localhost.evil.example/cb'],
  ])(
    'answers 400 text and no form on /authorize with a redirect_uri that is %s',
    async (_n, uri) => {
      const query = new URLSearchParams({ state: 's', nonce: 'n' });
      if (uri !== undefined) query.set('redirect_uri', uri);

      const response = await fetch(`${base}/authorize?${query}`);
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toMatch(/text\/plain/);
      expect(text).toBe(REFUSED_TEXT);
      expect(text).not.toContain('<form');
    },
  );

  it.each([
    'http://localhost:3001/cb',
    'http://127.0.0.1:4000/cb',
    'https://localhost/cb',
    'http://[::1]:3000/cb',
  ])('shows the form for the local redirect_uri %s', async (uri) => {
    const response = await fetch(`${base}/authorize?${new URLSearchParams({ redirect_uri: uri })}`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<form');
  });

  it.each(['http://localhost:3001/cb', 'http://127.0.0.1:4000/cb', 'https://localhost/cb'])(
    'issues a code on /authorize/confirm for the local redirect_uri %s',
    async (uri) => {
      const { response, location } = await signInTo(uri);

      expect(response.status).toBe(302);
      expect(`${location.origin}${location.pathname}`).toBe(
        new URL(uri).origin + new URL(uri).pathname,
      );
      expect(location.searchParams.get('code')).not.toBeNull();
    },
  );

  it.each(['javascript:alert(1)', 'http://evil.example/cb', 'ftp://localhost/cb'])(
    'sends /authorize/confirm with redirect_uri %s to /authorize/refused, with no code or state',
    async (uri) => {
      const { response, location } = await signInTo(uri);

      expect(response.status).toBe(302);
      expect(location.href).toBe(`${server.issuer.url}/authorize/refused`);
      expect(location.search).toBe('');
      expect(location.href).not.toContain('state-1');

      const refused = await fetch(`${base}/authorize/refused`);
      expect(refused.status).toBe(400);
      expect(await refused.text()).toBe(REFUSED_TEXT);
    },
  );

  async function signInTo(uri: string) {
    const response = await confirm({ redirect_uri: uri, email: 'loc@example.com', name: 'Loc' });
    return { response, location: new URL(response.headers.get('location') ?? '') };
  }

  function endSession(uri: string): Promise<Response> {
    const query = new URLSearchParams({ post_logout_redirect_uri: uri });
    return fetch(`${base}/endsession?${query}`, { redirect: 'manual' });
  }

  it.each(['https://evil.example/', 'javascript:alert(1)'])(
    'sends /endsession with post_logout_redirect_uri %s to /authorize/refused, with no query',
    async (uri) => {
      const response = await endSession(uri);
      const location = new URL(response.headers.get('location') ?? '');

      expect(response.status).toBe(302);
      expect(location.href).toBe(`${server.issuer.url}/authorize/refused`);
      expect(location.search).toBe('');
    },
  );

  it('sends /endsession with a local post_logout_redirect_uri to that address', async () => {
    const response = await endSession('http://localhost:3001/');
    const location = new URL(response.headers.get('location') ?? '');

    expect(response.status).toBe(302);
    expect(`${location.origin}${location.pathname}`).toBe('http://localhost:3001/');
  });

  it('answers 401 invalid_token on /userinfo for an unknown bearer token', async () => {
    const response = await userinfo('unknown-token');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
  });

  it('answers 401 on /userinfo with no token', async () => {
    const response = await fetch(`${base}/userinfo`);

    expect(response.status).toBe(401);
  });

  it("keeps each sign-in apart: a second user does not read the first one's claims", async () => {
    const a = await exchange(
      (await signIn('a@example.com', 'A')).location.searchParams.get('code') ?? '',
    );
    const b = await exchange(
      (await signIn('b@example.com', 'B')).location.searchParams.get('code') ?? '',
    );

    expect(await (await userinfo(a.access_token)).json()).toMatchObject({ email: 'a@example.com' });
    expect(await (await userinfo(b.access_token)).json()).toMatchObject({ email: 'b@example.com' });
  });
});
