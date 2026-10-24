import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiProviderError } from './ai-provider.error.js';
import { OpenAiClient } from './openai-client.js';
import { parseOpenAiProxyUrl } from '../config/openai-proxy-url.js';

const KEY = 'sk-secret-key-123';
const PASSWORD = 'Pw0rd9x';
const proxy = parseOpenAiProxyUrl(`http://proxyuser:${PASSWORD}@proxy.example.ru:3128`);
const signal = () => new AbortController().signal;

const modelsBody = { data: [{ id: 'gpt-image-2' }] };
const jsonOk = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function setup(options: { proxy?: typeof proxy; fetch: ReturnType<typeof vi.fn> }) {
  const logger = { warn: vi.fn(), error: vi.fn() };
  const client = new OpenAiClient({
    apiKey: KEY,
    proxy: options.proxy,
    logger,
    fetch: options.fetch as unknown as ConstructorParameters<typeof OpenAiClient>[0]['fetch'],
    backoffMs: [0, 0],
  });
  return { client, logger };
}

async function failureOf(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiProviderError);
    return error as AiProviderError;
  }
  throw new Error('expected a failure');
}

describe('OpenAiClient through a proxy', () => {
  it('hands a ProxyAgent to fetch as the dispatcher of every request', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(jsonOk(modelsBody)));
    const { client } = setup({ proxy, fetch });

    await client.listModels({ signal: signal() });
    await client.listModels({ signal: signal() });

    expect(fetch).toHaveBeenCalledTimes(2);
    const dispatchers = fetch.mock.calls.map(
      ([, init]) => (init as { dispatcher?: unknown }).dispatcher,
    );
    expect(dispatchers[0]).toBeInstanceOf(ProxyAgent);
    expect(dispatchers[1]).toBe(dispatchers[0]);
  });

  it('sends the moderation, responses and edits calls through the dispatcher too', async () => {
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonOk({
          results: [{ flagged: false, categories: {} }],
          output: [],
          data: [],
        }),
      ),
    );
    const { client } = setup({ proxy, fetch });

    await client.moderate({ text: 'x' }, { signal: signal() });
    await client.respond({ model: 'm' }, { signal: signal() });
    await client.editImage(new FormData(), { signal: signal() });

    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect((init as { dispatcher?: unknown }).dispatcher).toBeInstanceOf(ProxyAgent);
    }
  });

  it.each([
    ['no proxy given', undefined],
    ['a null proxy', null],
  ])('sends no dispatcher with %s', async (_name, value) => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(jsonOk(modelsBody)));
    const { client } = setup({ proxy: value, fetch });

    await client.listModels({ signal: signal() });

    const [, init] = fetch.mock.calls[0] as [string, { dispatcher?: unknown }];
    expect(init.dispatcher).toBeUndefined();
  });
});

describe('OpenAiClient.listModels', () => {
  it('sends GET /v1/models with the key and no body', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonOk(modelsBody));
    const { client } = setup({ fetch });

    await expect(client.listModels({ signal: signal() })).resolves.toBeUndefined();

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ Authorization: `Bearer ${KEY}` });
  });

  it('fails as list_models with the status and code of an error answer', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'invalid_api_key' } }), {
        status: 401,
        headers: { 'x-request-id': 'req_1' },
      }),
    );
    const { client } = setup({ fetch });

    const error = await failureOf(client.listModels({ signal: signal() }));

    expect(error.operation).toBe('list_models');
    expect(error.status).toBe(401);
    expect(error.code).toBe('invalid_api_key');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails on a malformed answer', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonOk({ nope: true }));
    const { client } = setup({ fetch });

    const error = await failureOf(client.listModels({ signal: signal() }));

    expect(error.code).toBe('malformed_answer');
  });
});

// What undici throws when the proxy answers CONNECT with a refusal.
function proxyRefusal(status: number): TypeError {
  const aborted = Object.assign(
    new Error(`Proxy response (${status}) !== 200 when HTTP Tunneling`),
    { name: 'AbortError', code: 'UND_ERR_ABORTED' },
  );
  return new TypeError('fetch failed', {
    cause: new DOMException('Request was cancelled.', { cause: aborted }),
  });
}

describe('OpenAiClient retry of an unsent request', () => {
  it.each([407, 403, 503])(
    'repeats a call with retry "unsent" when the proxy refuses the tunnel with %i',
    async (status) => {
      const fetch = vi
        .fn()
        .mockRejectedValueOnce(proxyRefusal(status))
        .mockResolvedValueOnce(jsonOk(modelsBody));
      const { client } = setup({ proxy, fetch });

      await client.listModels({ signal: signal(), retry: 'unsent' });

      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('ends as a network failure after three refusals', async () => {
    const fetch = vi.fn().mockRejectedValue(proxyRefusal(407));
    const { client } = setup({ proxy, fetch });

    const error = await failureOf(client.listModels({ signal: signal(), retry: 'unsent' }));

    expect(error.reason).toBe('network');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not repeat a call with retry "unsent" for an unrelated abort error', async () => {
    const other = new TypeError('fetch failed', {
      cause: new DOMException('Request was cancelled.', {
        cause: Object.assign(new Error('Socket closed'), { code: 'UND_ERR_ABORTED' }),
      }),
    });
    const fetch = vi.fn().mockRejectedValue(other);
    const { client } = setup({ proxy, fetch });

    const error = await failureOf(client.listModels({ signal: signal(), retry: 'unsent' }));

    expect(error.reason).toBe('network');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a call with retry "unsent" when the message fits but the code does not', async () => {
    const other = new TypeError('fetch failed', {
      cause: Object.assign(new Error('Proxy response (407) !== 200 when HTTP Tunneling'), {
        code: 'ECONNRESET',
      }),
    });
    const fetch = vi.fn().mockRejectedValue(other);
    const { client } = setup({ proxy, fetch });

    await failureOf(client.listModels({ signal: signal(), retry: 'unsent' }));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('repeats an "unsent" call for a refused connection found deep in the cause chain', async () => {
    const refused = new TypeError('fetch failed', {
      cause: new Error('wrapper', {
        cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      }),
    });
    const fetch = vi.fn().mockRejectedValueOnce(refused).mockResolvedValueOnce(jsonOk(modelsBody));
    const { client } = setup({ proxy, fetch });

    await client.listModels({ signal: signal(), retry: 'unsent' });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never carries the proxy password or the key in the error', async () => {
    const fetch = vi.fn().mockRejectedValue(proxyRefusal(407));
    const { client, logger } = setup({ proxy, fetch });

    const error = await failureOf(client.listModels({ signal: signal() }));

    const text = JSON.stringify([
      error.message,
      error.name,
      logger.warn.mock.calls,
      logger.error.mock.calls,
    ]);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain('proxyuser');
    expect(text).not.toContain(Buffer.from(`proxyuser:${PASSWORD}`).toString('base64'));
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('proxy.example.ru');
  });
});

describe('OpenAiClient edits call over the real undici fetch', () => {
  let server: Server | undefined;

  afterEach(async () => {
    const closing = server;
    server = undefined;
    if (closing === undefined) return;
    closing.closeAllConnections();
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  });

  it('sends the global FormData as multipart with its fields, files and exact bytes', async () => {
    const received: { contentType: string | undefined; body: Buffer }[] = [];
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({
          contentType: request.headers['content-type'],
          body: Buffer.concat(chunks),
        });
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ data: [{ b64_json: 'AAEC' }] }));
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    // The client always calls OpenAI's origin: the wrapper keeps undici's real fetch and its real
    // body serialization and only moves the address to the loopback server.
    const local = (url: string, init: Parameters<typeof undiciFetch>[1]) =>
      undiciFetch(url.replace('https://api.openai.com', `http://127.0.0.1:${port}`), init);
    const client = new OpenAiClient({
      apiKey: KEY,
      logger: { warn: vi.fn(), error: vi.fn() },
      fetch: local as unknown as ConstructorParameters<typeof OpenAiClient>[0]['fetch'],
      backoffMs: [0, 0],
    });
    const person = Uint8Array.from([0xff, 0xd8, 0x00, 0x80, 0xfe, 0x0d, 0x0a, 0x01]);
    const item = Uint8Array.from([0x89, 0x50, 0x00, 0xc3, 0x28, 0xff, 0x02]);
    const form = new FormData();
    form.set('model', 'gpt-image-2');
    form.set('prompt', 'put it on');
    form.append('image[]', new File([person], 'person.jpg', { type: 'image/jpeg' }));
    form.append('image[]', new File([item], 'item-1.png', { type: 'image/png' }));

    const edited = await client.editImage(form, { signal: signal() });

    expect(edited.answer.data[0]?.b64_json).toBe('AAEC');
    expect(received).toHaveLength(1);
    const { contentType, body } = received[0] ?? { contentType: undefined, body: Buffer.alloc(0) };
    expect(contentType).toMatch(/^multipart\/form-data; boundary=\S+$/);
    expect(body.toString('latin1')).not.toContain('[object FormData]');
    const text = body.toString('latin1');
    expect(text).toContain('name="model"\r\n\r\ngpt-image-2\r\n');
    expect(text).toContain('name="prompt"\r\n\r\nput it on\r\n');
    expect(text.match(/name="image\[\]"/g)).toHaveLength(2);
    expect(text).toContain('filename="person.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
    expect(text).toContain('filename="item-1.png"\r\nContent-Type: image/png\r\n\r\n');
    const afterHeaders = (filename: string, bytes: Uint8Array) => {
      const marker = Buffer.from(`filename="${filename}"`, 'latin1');
      const start = body.indexOf('\r\n\r\n', body.indexOf(marker)) + 4;
      return body.subarray(start, start + bytes.length);
    };
    expect([...afterHeaders('person.jpg', person)]).toEqual([...person]);
    expect([...afterHeaders('item-1.png', item)]).toEqual([...item]);
  });
});

describe('OpenAiClient against a proxy that refuses the tunnel', () => {
  let server: Server | undefined;

  afterEach(async () => {
    const closing = server;
    server = undefined;
    if (closing === undefined) return;
    closing.closeAllConnections();
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  });

  // A loopback server that answers every CONNECT with `status`; nothing leaves the machine.
  async function refusingProxy(status: number) {
    const connects: { target: string | undefined; authorization: string | undefined }[] = [];
    server = createServer();
    server.on('connect', (request, socket) => {
      connects.push({ target: request.url, authorization: request.headers['proxy-authorization'] });
      socket.end(`HTTP/1.1 ${status} Refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return { connects, port };
  }

  it.each([407, 403, 503])(
    'repeats an "unsent" call after the proxy answered CONNECT with %i, then fails as a network error',
    async (status) => {
      const { connects, port } = await refusingProxy(status);
      const local = parseOpenAiProxyUrl(`http://proxyuser:${PASSWORD}@127.0.0.1:${port}`);
      const logger = { warn: vi.fn(), error: vi.fn() };
      const client = new OpenAiClient({ apiKey: KEY, proxy: local, logger, backoffMs: [0, 0] });

      const error = await failureOf(
        client.editImage(new FormData(), { signal: signal(), retry: 'unsent' }),
      );

      expect(error.reason).toBe('network');
      expect(connects).toHaveLength(3);
      expect(connects[0]).toEqual({
        target: 'api.openai.com:443',
        authorization: local?.token,
      });
      const text = JSON.stringify([error.message, logger.warn.mock.calls, logger.error.mock.calls]);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(KEY);
    },
  );

  it('repeats an "unsent" call when the proxy closes the connection before answering CONNECT', async () => {
    let connects = 0;
    server = createServer();
    server.on('connect', (_request, socket) => {
      connects += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const local = parseOpenAiProxyUrl(`http://proxyuser:${PASSWORD}@127.0.0.1:${port}`);
    const client = new OpenAiClient({
      apiKey: KEY,
      proxy: local,
      logger: { warn: vi.fn(), error: vi.fn() },
      backoffMs: [0, 0],
    });

    const error = await failureOf(
      client.editImage(new FormData(), { signal: signal(), retry: 'unsent' }),
    );

    expect(error.reason).toBe('network');
    expect(connects).toBe(3);
  });

  it('does not repeat a call with retry false', async () => {
    const { connects, port } = await refusingProxy(407);
    const local = parseOpenAiProxyUrl(`http://proxyuser:${PASSWORD}@127.0.0.1:${port}`);
    const client = new OpenAiClient({
      apiKey: KEY,
      proxy: local,
      logger: { warn: vi.fn(), error: vi.fn() },
      backoffMs: [0, 0],
    });

    const error = await failureOf(client.listModels({ signal: signal(), retry: false }));

    expect(error.reason).toBe('network');
    expect(connects).toHaveLength(1);
  });
});
