// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { callApi } from './call-api';
import { ERROR_TEXTS, GENERAL_TEXT } from './error-text';
import { ApiError, buildPath, errorText } from './index';

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

function envelope(code: string, details: unknown[] = [], message = 'english message'): string {
  return JSON.stringify({ error: { code, message, details } });
}

describe('callApi error envelope', () => {
  it('keeps code, status and details of a 400 VALIDATION_FAILED', async () => {
    const details = [
      { field: 'name', code: 'IS_STRING', message: 'name must be a string' },
      { field: '', code: 'TOO_MANY_ERRORS', message: '12 more errors' },
    ];
    fetchMock.mockResolvedValue(
      new Response(envelope('VALIDATION_FAILED', details), { status: 400 }),
    );
    const error = await failure();
    expect(error).toMatchObject({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_FAILED',
      details,
      template: '/things/:id',
    });
  });

  it.each([
    [404, 'NOT_FOUND'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('keeps code of a %s %s answer with no details', async (status, code) => {
    fetchMock.mockResolvedValue(new Response(envelope(code), { status }));
    const error = await failure();
    expect(error).toMatchObject({ kind: 'http', status, code, details: [] });
  });

  it('keeps a code the web does not know', async () => {
    fetchMock.mockResolvedValue(new Response(envelope('BRAND_NEW_CODE'), { status: 418 }));
    expect(await failure()).toMatchObject({ kind: 'http', status: 418, code: 'BRAND_NEW_CODE' });
  });

  it.each([
    ['nginx html', () => new Response('<html>502 Bad Gateway</html>', { status: 502 }), 502],
    ['empty body', () => new Response(null, { status: 500 }), 500],
    ['empty JSON object', () => new Response('{}', { status: 500 }), 500],
    ['JSON array', () => new Response('[]', { status: 400 }), 400],
    ['error without code', () => new Response('{"error":{"message":"m"}}', { status: 400 }), 400],
    ['non-string code', () => new Response('{"error":{"code":5}}', { status: 400 }), 400],
    ['code of 65 characters', () => new Response(envelope('A'.repeat(65)), { status: 400 }), 400],
  ])('is an http error without code for %s', async (_name, response, status) => {
    fetchMock.mockResolvedValue(response());
    const error = await failure();
    expect(error).toMatchObject({ kind: 'http', status, details: [] });
    expect(error.code).toBeUndefined();
  });

  it('keeps a code of 64 characters', async () => {
    const code = 'A'.repeat(64);
    fetchMock.mockResolvedValue(new Response(envelope(code), { status: 400 }));
    expect(await failure()).toMatchObject({ code });
  });

  describe('an envelope whose details do not fit', () => {
    const detail = { field: 'f', code: 'IS_STRING', message: 'm' };
    const arrange = (error: object, status = 400) =>
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ error }), { status }));

    it('keeps the code, with no details, when details are missing', async () => {
      arrange({ code: 'NOT_FOUND', message: 'm' }, 404);
      const error = await failure();
      expect(error).toMatchObject({ kind: 'http', status: 404, code: 'NOT_FOUND', details: [] });
    });

    it('keeps the code, with no details, when an entry has no message', async () => {
      arrange({
        code: 'VALIDATION_FAILED',
        message: 'm',
        details: [detail, { field: 'f', code: 'IS_STRING' }],
      });
      const error = await failure();
      expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: [] });
    });

    it('passes 51 details', async () => {
      const details = Array.from({ length: 51 }, () => detail);
      arrange({ code: 'VALIDATION_FAILED', message: 'm', details });
      expect((await failure()).details).toHaveLength(51);
    });

    it('keeps the code, with no details, for 52 details', async () => {
      const details = Array.from({ length: 52 }, () => detail);
      arrange({ code: 'VALIDATION_FAILED', message: 'm', details });
      const error = await failure();
      expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: [] });
    });

    it('passes a field of 100 emoji (200 UTF-16 units)', async () => {
      const field = '😀'.repeat(100);
      arrange({ code: 'VALIDATION_FAILED', message: 'm', details: [{ ...detail, field }] });
      expect((await failure()).details).toEqual([{ ...detail, field }]);
    });

    it('falls back to the code alone for a field over 200 units', async () => {
      const field = 'a'.repeat(201);
      arrange({ code: 'VALIDATION_FAILED', message: 'm', details: [{ ...detail, field }] });
      expect(await failure()).toMatchObject({ code: 'VALIDATION_FAILED', details: [] });
    });

    it('passes a message of 400 units and falls back over it', async () => {
      arrange({
        code: 'VALIDATION_FAILED',
        message: 'm',
        details: [{ ...detail, message: 'a'.repeat(400) }],
      });
      expect((await failure()).details).toHaveLength(1);
      arrange({
        code: 'VALIDATION_FAILED',
        message: 'm',
        details: [{ ...detail, message: 'a'.repeat(401) }],
      });
      expect(await failure()).toMatchObject({ code: 'VALIDATION_FAILED', details: [] });
    });

    it('falls back to the code alone for a detail code of 65 characters', async () => {
      const details = [{ ...detail, code: 'A'.repeat(65) }];
      arrange({ code: 'VALIDATION_FAILED', message: 'm', details });
      expect(await failure()).toMatchObject({ code: 'VALIDATION_FAILED', details: [] });
    });
  });

  it.each([
    [502, ERROR_TEXTS.SERVICE_UNAVAILABLE],
    [504, ERROR_TEXTS.SERVICE_UNAVAILABLE],
    [413, ERROR_TEXTS.PAYLOAD_TOO_LARGE],
    [500, GENERAL_TEXT],
  ])('turns an nginx html %s into its visitor text', async (status, text) => {
    fetchMock.mockResolvedValue(new Response('<html><body>nginx</body></html>', { status }));
    expect(errorText(await failure())).toBe(text);
  });

  it('is an http error without code when the body cannot be read', async () => {
    const response = new Response('{}', { status: 500 });
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('terminated'));
    fetchMock.mockResolvedValue(response);
    const error = await failure();
    expect(error).toMatchObject({ kind: 'http', status: 500, details: [] });
    expect(error.code).toBeUndefined();
  });

  it('drops extra envelope fields', async () => {
    const body = {
      error: {
        code: 'NOT_FOUND',
        message: 'm',
        details: [{ field: 'f', code: 'MIN', message: 'x', extra: 1 }],
        stack: 'secret stack',
      },
      other: true,
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 404 }));
    const error = await failure();
    expect(error.details).toEqual([{ field: 'f', code: 'MIN', message: 'x' }]);
    expect(error).not.toHaveProperty('stack', 'secret stack');
    expect(JSON.stringify(error)).not.toContain('secret stack');
  });

  it('keeps the field and message of details out of the error message', async () => {
    const details = [
      { field: 'echo-field-value', code: 'IS_STRING', message: 'echo-message-text' },
    ];
    fetchMock.mockResolvedValue(
      new Response(envelope('VALIDATION_FAILED', details, 'echo-api-message'), { status: 400 }),
    );
    const error = await failure();
    expect(error.message).toContain('/things/:id');
    expect(error.message).not.toContain('echo-field-value');
    expect(error.message).not.toContain('echo-message-text');
    expect(error.message).not.toContain('echo-api-message');
  });
});

describe('callApi with a null schema', () => {
  async function nullFailure(): Promise<ApiError> {
    const error = await callApi(URL_, PATH, null, { method: 'DELETE' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  it('resolves a 204 to undefined without reading the body', async () => {
    const response = new Response(null, { status: 204 });
    const json = vi.spyOn(response, 'json');
    fetchMock.mockResolvedValue(response);
    await expect(callApi(URL_, PATH, null, { method: 'DELETE' })).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it.each([
    ['a 200 with a JSON body', () => new Response('{"ok":true}')],
    ['a 200 with no body', () => new Response(null, { status: 200 })],
    ['a 201 with a JSON body', () => new Response('{}', { status: 201 })],
  ])('fails as schema for %s', async (_name, response) => {
    fetchMock.mockResolvedValue(response());
    expect(await nullFailure()).toMatchObject({ kind: 'schema', template: '/things/:id' });
  });

  it('keeps the http path with code and details for an error status', async () => {
    const details = [{ field: 'firstName', code: 'MAX_LENGTH', message: 'too long' }];
    fetchMock.mockResolvedValue(
      new Response(envelope('VALIDATION_FAILED', details), { status: 400 }),
    );
    expect(await nullFailure()).toMatchObject({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_FAILED',
      details,
    });
  });

  it('keeps today path for a 204 with a real schema: schema failure', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await failure()).toMatchObject({ kind: 'schema' });
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
