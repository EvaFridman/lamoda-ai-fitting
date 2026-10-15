// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { callApi } from './call-api';
import { ApiError, buildPath } from './index';

const PATH = buildPath('/things/:id', { id: 'a' });
const URL_ = new URL('http://api:3000/things/a');
const schema = z.object({ ok: z.boolean() });

const fetchMock = vi.fn();

async function failure(): Promise<ApiError> {
  const error = await callApi(URL_, PATH, schema, {}).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('callApi messages', () => {
  const SECRET_VALUE = 'secret-value';
  const secretPath = buildPath('/things/:id', { id: SECRET_VALUE });
  const secretUrl = new URL(`http://api:3000${secretPath.path}`);

  it.each([
    ['http', () => fetchMock.mockResolvedValue(new Response('{}', { status: 500 }))],
    ['network', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
    [
      'timeout',
      () => fetchMock.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })),
    ],
    ['unreadable body', () => fetchMock.mockResolvedValue(new Response('<html>'))],
    ['schema', () => fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: 'yes' })))],
  ])('names the template and not the param for %s', async (_name, arrange) => {
    arrange();
    const error = await callApi(secretUrl, secretPath, schema, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const message = (error as ApiError).message;
    expect(message).toContain('/things/:id');
    expect(message).not.toContain(SECRET_VALUE);
  });
});

describe('callApi', () => {
  it('passes the url and options to fetch and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, extra: 1 })));
    const init = { method: 'POST' };
    await expect(callApi(URL_, PATH, schema, init)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(URL_, init);
  });

  it('answers http with the status and the template', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    const error = await failure();
    expect(error).toMatchObject({ kind: 'http', status: 404, template: '/things/:id' });
  });

  it('answers timeout for an Error named TimeoutError', async () => {
    const cause = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    fetchMock.mockRejectedValue(cause);
    const error = await failure();
    expect(error).toMatchObject({ kind: 'timeout', template: '/things/:id', cause });
    expect(error.status).toBeUndefined();
  });

  it('answers timeout for the signal of AbortSignal.timeout', async () => {
    const reason = await new Promise<unknown>((resolve) => {
      const signal = AbortSignal.timeout(1);
      signal.addEventListener('abort', () => resolve(signal.reason));
    });
    fetchMock.mockRejectedValue(reason);
    expect((await failure()).kind).toBe('timeout');
  });

  it('answers network for any other rejection', async () => {
    const cause = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(cause);
    const error = await failure();
    expect(error).toMatchObject({ kind: 'network', template: '/things/:id', cause });
  });

  it('answers network when the rejection is not an Error', async () => {
    fetchMock.mockRejectedValue('boom');
    expect((await failure()).kind).toBe('network');
  });

  it('answers schema for a 200 body that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>'));
    const error = await failure();
    expect(error).toMatchObject({ kind: 'schema', template: '/things/:id' });
  });

  it('answers schema for a body that does not match', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: 'yes' })));
    const error = await failure();
    expect(error).toMatchObject({ kind: 'schema', template: '/things/:id' });
    expect(error.message).toMatch(/unexpected api response/);
  });

  it('answers timeout when reading the body times out', async () => {
    const response = new Response('{}');
    vi.spyOn(response, 'json').mockRejectedValue(
      Object.assign(new Error('t'), { name: 'TimeoutError' }),
    );
    fetchMock.mockResolvedValue(response);
    expect((await failure()).kind).toBe('timeout');
  });

  it('answers network when the body is cut short', async () => {
    const response = new Response('{}');
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('terminated'));
    fetchMock.mockResolvedValue(response);
    expect((await failure()).kind).toBe('network');
  });
});
