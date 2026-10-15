// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  env: { API_URL: 'http://api:3000', PROXY_SECRET: '' } as Record<string, string>,
  incoming: new Headers(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(state.incoming) }));
vi.mock('@/shared/config/server', () => ({ getServerEnv: () => state.env }));

import { ApiError, buildPath, type ApiPath } from './index';
import { apiFetch } from './server';

// A path buildPath would never make, to check that the origin check still holds.
function forged(path: string): ApiPath {
  return { path, template: '/forged' } as unknown as ApiPath;
}

const THINGS = buildPath('/things');
const SECRET = 's'.repeat(32);
const ID = '0123456789abcdef0123456789abcdef';
const schema = z.object({ ok: z.boolean() });

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function sentHeaders(init?: RequestInit): Promise<Headers> {
  await apiFetch(THINGS, schema, init);
  const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return options.headers as Headers;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
  vi.stubGlobal('fetch', fetchMock);
  state.env = { API_URL: 'http://api:3000', PROXY_SECRET: '' };
  state.incoming = new Headers();
});

describe('apiFetch proxy secret', () => {
  it('sends the secret exactly as configured', async () => {
    state.env.PROXY_SECRET = SECRET;
    const sent = await sentHeaders();
    expect(sent.get('x-proxy-secret')).toBe(SECRET);
  });

  it('sends no secret when it is empty', async () => {
    const sent = await sentHeaders();
    expect(sent.has('x-proxy-secret')).toBe(false);
  });

  it('replaces a secret the caller passed', async () => {
    state.env.PROXY_SECRET = SECRET;
    const sent = await sentHeaders({ headers: { 'X-Proxy-Secret': 'forged' } });
    expect(sent.get('x-proxy-secret')).toBe(SECRET);
  });

  it('does not pass on a secret of the incoming page request', async () => {
    state.incoming = new Headers({ 'x-proxy-secret': 'evil' });
    const sent = await sentHeaders();
    expect(sent.has('x-proxy-secret')).toBe(false);
  });

  it('sends its own secret, not the one of the incoming page request', async () => {
    state.env.PROXY_SECRET = SECRET;
    state.incoming = new Headers({ 'x-proxy-secret': 'evil' });
    const sent = await sentHeaders();
    expect(sent.get('x-proxy-secret')).toBe(SECRET);
  });

  it('drops a caller secret when web has none', async () => {
    const sent = await sentHeaders({ headers: { 'X-Proxy-Secret': 'forged' } });
    expect(sent.has('x-proxy-secret')).toBe(false);
  });
});

describe('apiFetch caller headers', () => {
  it('drops forwarded address and request id of the caller', async () => {
    const sent = await sentHeaders({
      headers: { 'X-Forwarded-For': '6.6.6.6', 'X-Request-Id': ID },
    });
    expect(sent.has('x-forwarded-for')).toBe(false);
    expect(sent.has('x-request-id')).toBe(false);
  });

  it('replaces them with the visitor values', async () => {
    state.incoming = new Headers({ 'x-real-ip': '203.0.113.7', 'x-request-id': ID });
    const sent = await sentHeaders({
      headers: { 'X-Forwarded-For': '6.6.6.6', 'X-Request-Id': 'f'.repeat(32) },
    });
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(sent.get('x-request-id')).toBe(ID);
  });

  it('keeps the other caller headers and the init options', async () => {
    await apiFetch(THINGS, schema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Custom': 'a' },
      body: '{}',
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const sent = options.headers as Headers;
    expect(sent.get('content-type')).toBe('application/json');
    expect(sent.get('x-custom')).toBe('a');
    expect(options.method).toBe('POST');
    expect(options.body).toBe('{}');
  });

  it('calls the url built from API_URL', async () => {
    await apiFetch(buildPath('/things', {}, { x: 1 }), schema);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api:3000/things?x=1');
  });
});

describe('apiFetch visitor address', () => {
  it.each(['203.0.113.7', '2001:db8::1'])('forwards x-real-ip %s', async (ip) => {
    state.incoming = new Headers({ 'x-real-ip': ip });
    const sent = await sentHeaders();
    expect(sent.get('x-forwarded-for')).toBe(ip);
  });

  it('trims x-real-ip', async () => {
    state.incoming = new Headers({ 'x-real-ip': '  203.0.113.7 ' });
    const sent = await sentHeaders();
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('prefers x-real-ip over x-forwarded-for', async () => {
    state.incoming = new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' });
    const sent = await sentHeaders();
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('does not fall back to x-forwarded-for when x-real-ip is garbage', async () => {
    state.incoming = new Headers({ 'x-real-ip': 'garbage', 'x-forwarded-for': '198.51.100.1' });
    const sent = await sentHeaders();
    expect(sent.has('x-forwarded-for')).toBe(false);
  });

  it('uses x-forwarded-for when x-real-ip is blank', async () => {
    state.incoming = new Headers({ 'x-real-ip': '  ', 'x-forwarded-for': '198.51.100.1' });
    const sent = await sentHeaders();
    expect(sent.get('x-forwarded-for')).toBe('198.51.100.1');
  });

  it('takes the last element of an x-forwarded-for list', async () => {
    state.incoming = new Headers({ 'x-forwarded-for': '6.6.6.6, 10.0.0.1 ,  198.51.100.1 ' });
    const sent = await sentHeaders();
    expect(sent.get('x-forwarded-for')).toBe('198.51.100.1');
  });

  it.each(['not-an-ip', '1.2.3', '1.2.3.4:80', '1.2.3.4 5.6.7.8', '999.1.1.1', '1.2.3.4,'])(
    'sends nothing for %j',
    async (value) => {
      state.incoming = new Headers({ 'x-forwarded-for': value });
      const sent = await sentHeaders();
      expect(sent.has('x-forwarded-for')).toBe(false);
    },
  );

  it('sends nothing without incoming address headers', async () => {
    const sent = await sentHeaders();
    expect(sent.has('x-forwarded-for')).toBe(false);
  });
});

describe('apiFetch request id', () => {
  it.each([ID, ID.toUpperCase(), `  ${ID}  `])('forwards %j', async (value) => {
    state.incoming = new Headers({ 'x-request-id': value });
    const sent = await sentHeaders();
    expect(sent.get('x-request-id')).toBe(value.trim());
  });

  it.each([
    ['uuid with dashes', '01234567-89ab-cdef-0123-456789abcdef'],
    ['31 characters', ID.slice(1)],
    ['33 characters', `${ID}0`],
    ['non-hex', `${ID.slice(1)}g`],
    ['empty', ''],
  ])('does not forward %s', async (_name, value) => {
    state.incoming = new Headers({ 'x-request-id': value });
    const sent = await sentHeaders();
    expect(sent.has('x-request-id')).toBe(false);
  });
});

describe('apiFetch path origin', () => {
  it.each(['//evil.example/x', 'https://evil.example/x', '/\\evil.example/x'])(
    'refuses %s before calling fetch',
    async (path) => {
      const error = await apiFetch(forged(path), schema).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toBe('path leaves the api: evil.example');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('names only the host in the error, not userinfo, path or query', async () => {
    const error = await apiFetch(forged('//user:pw@evil.example/x?q=1'), schema).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    const message = (error as ApiError).message;
    expect(message).toBe('path leaves the api: evil.example');
    expect(message).not.toContain('pw');
    expect(message).not.toContain('q=1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('overrides a caller redirect option with error', async () => {
    await apiFetch(THINGS, schema, { redirect: 'follow' });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.redirect).toBe('error');
  });

  it('accepts an absolute url on the origin of API_URL', async () => {
    await expect(apiFetch(forged('http://api:3000/things'), schema)).resolves.toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api:3000/things');
  });
});

describe('apiFetch results', () => {
  it('returns the parsed body', async () => {
    await expect(apiFetch(THINGS, schema)).resolves.toEqual({ ok: true });
  });

  it('throws ApiError with the status on a non-2xx answer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503));
    await expect(apiFetch(THINGS, schema)).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
    });
  });

  it('throws ApiError when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const error = await apiFetch(THINGS, schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBeUndefined();
  });

  it('throws ApiError when the body does not match the schema', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: 'yes' }));
    await expect(apiFetch(THINGS, schema)).rejects.toThrow(/unexpected api response/);
  });
});

describe('apiFetch error kinds', () => {
  const path = buildPath('/things/:id', { id: 'a' });

  it.each([
    ['http', () => fetchMock.mockResolvedValue(jsonResponse({}, 500)), 500],
    [
      'timeout',
      () => fetchMock.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })),
      undefined,
    ],
    ['network', () => fetchMock.mockRejectedValue(new TypeError('fetch failed')), undefined],
    ['schema', () => fetchMock.mockResolvedValue(new Response('not json')), undefined],
    ['schema', () => fetchMock.mockResolvedValue(jsonResponse({ ok: 1 })), undefined],
  ])('kind %s carries the template', async (kind, arrange, status) => {
    arrange();
    const error = (await apiFetch(path, schema).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind, template: '/things/:id', status });
  });

  it('refuses a path outside the origin with kind path and the template', async () => {
    const error = (await apiFetch(forged('//evil.example/x'), schema).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(error).toMatchObject({ kind: 'path', template: '/forged' });
  });

  it('keeps a segment taken from input on the api origin', async () => {
    await apiFetch(buildPath('/things/:id', { id: '..' + '/users' }), schema);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api:3000/things/..%2Fusers');
  });

  it.each([
    ['http', () => fetchMock.mockResolvedValue(jsonResponse({}, 500))],
    ['network', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
    [
      'timeout',
      () => fetchMock.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })),
    ],
    ['unreadable body', () => fetchMock.mockResolvedValue(new Response('not json'))],
    ['schema', () => fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }))],
  ])('names the template and not the param in the %s message', async (_name, arrange) => {
    arrange();
    const secretPath = buildPath('/things/:id', { id: 'secret-value' });
    const error = (await apiFetch(secretPath, schema).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toContain('/things/:id');
    expect(error.message).not.toContain('secret-value');
  });

  it('sends a 5 s timeout signal and redirect error', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await apiFetch(THINGS, schema);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe('error');
    timeout.mockRestore();
  });
});
