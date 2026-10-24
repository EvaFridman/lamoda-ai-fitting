// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/_pages/catalog/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/_pages/catalog/server')>()),
  categoryProxy: vi.fn(),
}));
// The storage's browser address of the local stack (spec 0019): its origin goes into img-src.
vi.mock('@/shared/config/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/config/server')>()),
  getServerEnv: () => ({ S3_PUBLIC_ENDPOINT: 'http://localhost:8335', S3_BUCKET: 'ai-fitting' }),
}));

import { categoryProxy } from '@/_pages/catalog/server';

import { config, proxy } from './proxy';

const category = vi.mocked(categoryProxy);

function request(path: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(`https://site.test${path}`, { headers });
}

function forwarded(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

function nonceOf(policy: string | null): string {
  return /'nonce-([^']+)'/.exec(policy ?? '')?.[1] ?? '';
}

beforeEach(() => {
  category.mockReset();
  category.mockImplementation((_request, requestHeaders) =>
    Promise.resolve(NextResponse.next({ request: { headers: requestHeaders } })),
  );
});

describe('proxy', () => {
  it('puts the same policy on the response and on the forwarded request', async () => {
    const response = await proxy(request('/privacy'));
    const policy = response.headers.get('content-security-policy');
    expect(policy).toContain("default-src 'self'");
    expect(nonceOf(policy)).not.toBe('');
    expect(forwarded(response, 'content-security-policy')).toBe(policy);
    expect(response.headers.get('x-middleware-override-headers')).toContain('x-nonce');
  });

  it("lets images load from the users' folders of the bucket, where their photos are", async () => {
    const response = await proxy(request('/customer/photos'));
    expect(response.headers.get('content-security-policy')).toContain(
      "img-src 'self' data: blob: http://localhost:8335/ai-fitting/keep/users/;",
    );
  });

  it("forwards the nonce of the policy as x-nonce, replacing a client's", async () => {
    const response = await proxy(request('/privacy', { 'x-nonce': 'forged' }));
    const nonce = nonceOf(response.headers.get('content-security-policy'));
    expect(forwarded(response, 'x-nonce')).toBe(nonce);
    expect(nonce).not.toBe('forged');
  });

  it('keeps the client headers on the forwarded request', async () => {
    const response = await proxy(request('/privacy', { 'x-real-ip': '203.0.113.7' }));
    expect(forwarded(response, 'x-real-ip')).toBe('203.0.113.7');
  });

  it('gives each request its own nonce', async () => {
    const first = await proxy(request('/privacy'));
    const second = await proxy(request('/privacy'));
    expect(nonceOf(first.headers.get('content-security-policy'))).not.toBe(
      nonceOf(second.headers.get('content-security-policy')),
    );
  });

  it.each(['/privacy', '/catalog', '/catalog/dresses/extra'])(
    'does not run the category check for %s',
    async (path) => {
      await proxy(request(path));
      expect(category).not.toHaveBeenCalled();
    },
  );

  it('runs the category check for /catalog/<slug> with the forwarded headers', async () => {
    const response = await proxy(request('/catalog/dresses'));
    expect(category).toHaveBeenCalledTimes(1);
    const passed = category.mock.calls[0]?.[1];
    expect(passed?.get('x-nonce')).toBe(nonceOf(response.headers.get('content-security-policy')));
    expect(passed?.get('content-security-policy')).toBe(
      response.headers.get('content-security-policy'),
    );
  });

  it('adds the policy to the not-found rewrite and keeps the forwarded headers', async () => {
    category.mockImplementation((incoming, requestHeaders) =>
      Promise.resolve(
        NextResponse.rewrite(new URL('/_category-not-found', incoming.url), {
          request: { headers: requestHeaders },
        }),
      ),
    );
    const response = await proxy(request('/catalog/none'));
    const policy = response.headers.get('content-security-policy');
    expect(response.headers.get('x-middleware-rewrite')).toContain('/_category-not-found');
    expect(policy).toContain("object-src 'none'");
    expect(forwarded(response, 'x-nonce')).toBe(nonceOf(policy));
  });

  it('gives the development policy eval and the production one not', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const dev = await proxy(request('/privacy'));
    vi.stubEnv('NODE_ENV', 'production');
    const prod = await proxy(request('/privacy'));
    vi.unstubAllEnvs();
    expect(dev.headers.get('content-security-policy')).toContain("'unsafe-eval'");
    expect(prod.headers.get('content-security-policy')).not.toContain("'unsafe-eval'");
  });
});

describe('config.matcher', () => {
  // Next anchors the pattern to the whole path.
  const matcher = new RegExp(`^${String(config.matcher)}$`);

  // `/_next/foo` renders the not-found page, so it gets the policy too.
  it.each([
    '/',
    '/privacy',
    '/catalog',
    '/catalog/dresses',
    '/customer/account',
    '/ui-kit',
    '/_next/foo',
  ])('matches the page %s', (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each([
    '/_next/static/a.js',
    '/_next/image',
    '/_next/webpack-hmr',
    '/api/x',
    '/api/auth/get-session',
    '/media/x',
    '/socket.io/',
    '/healthz',
    '/healthz/',
    '/healthz/warmup',
  ])('skips %s', (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  // `/socket.io` without the slash reaches web in production (nginx forwards only `/socket.io/`):
  // its not-found page gets the policy.
  it.each(['/healthzx', '/apix', '/mediax', '/socket.io', '/socket.iox', '/socketxio'])(
    'still matches %s',
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );
});
