import * as Sentry from '@sentry/nestjs';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { AuthLogger } from './auth.js';
import { authErrorHandler } from './auth-error-handler.js';
import { authBody, authTimeout, clientBodyError, onlyParsedBodies } from './auth-limits.js';

vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureMessage: vi.fn(),
}));

function loggerStub(): { [K in keyof AuthLogger]: Mock<AuthLogger[K]> } {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function bodyError(type: string | undefined, status: number, expose = true): Error {
  return Object.assign(new Error('x'), { type, status, expose });
}

describe('clientBodyError', () => {
  it('maps a body over the limit to 413 PAYLOAD_TOO_LARGE', () => {
    expect(clientBodyError(bodyError('entity.too.large', 413))).toEqual({
      status: 413,
      body: { code: 'PAYLOAD_TOO_LARGE', message: 'The body is too large' },
    });
  });

  it('maps broken JSON to 400 BAD_REQUEST with Better Auth words', () => {
    expect(clientBodyError(bodyError('entity.parse.failed', 400))).toEqual({
      status: 400,
      body: { code: 'BAD_REQUEST', message: 'Invalid JSON in request body' },
    });
  });

  it.each([
    ['another typed 4xx', bodyError('request.size.invalid', 400, false)],
    ['a 4xx marked expose without a type', bodyError(undefined, 400, true)],
    ['an aborted request', bodyError('request.aborted', 400)],
  ])('maps %s to 400 "The body cannot be read"', (_label, error) => {
    expect(clientBodyError(error)).toEqual({
      status: 400,
      body: { code: 'BAD_REQUEST', message: 'The body cannot be read' },
    });
  });

  it.each([
    ['an unsupported charset', bodyError('charset.unsupported', 415)],
    ['an unsupported content encoding', bodyError('encoding.unsupported', 415, false)],
    ['a 415 without a type', bodyError(undefined, 415, false)],
  ])('maps %s to 415 UNSUPPORTED_MEDIA_TYPE', (_label, error) => {
    expect(clientBodyError(error)).toEqual({
      status: 415,
      body: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Only JSON bodies are accepted' },
    });
  });

  it.each([
    ['a plain error', new Error('db down')],
    ['a 5xx with a type', bodyError('some.type', 500)],
    ['a 4xx without type or expose', bodyError(undefined, 400, false)],
    ['a value that is not an error', 'entity.too.large'],
    ['undefined', undefined],
  ])('leaves %s to the 500 answer', (_label, error) => {
    expect(clientBodyError(error)).toBeUndefined();
  });
});

describe('authBody', () => {
  function app(limit: number) {
    const instance = express();
    instance.post('/x', authBody(limit), (req, res) => {
      res.json({ body: req.body as unknown });
    });
    instance.use((error: unknown, _req: unknown, res: express.Response, _next: unknown) => {
      res.status(500).json({ type: (error as { type?: string }).type });
    });
    return instance;
  }

  it.each(['application/json', 'application/vnd.api+json'])('parses %s', async (type) => {
    const response = await request(app(100)).post('/x').set('Content-Type', type).send('{"a":1}');

    expect(response.body).toEqual({ body: { a: 1 } });
  });

  it.each([
    'application/json5',
    'APPLICATION/JSON',
    'Application/Json; charset=utf-8',
    'text/json',
  ])('parses %s too, so the limit applies to it', async (type) => {
    const ok = await request(app(100)).post('/x').set('Content-Type', type).send('{"a":1}');
    const big = await request(app(10))
      .post('/x')
      .set('Content-Type', type)
      .send(JSON.stringify({ a: 'x'.repeat(50) }));

    expect(ok.body).toEqual({ body: { a: 1 } });
    expect(big.body).toEqual({ type: 'entity.too.large' });
  });

  it('does not take a type that has json only in a parameter', async () => {
    const response = await request(app(100))
      .post('/x')
      .set('Content-Type', 'text/plain; note=json')
      .send('{}');

    expect(response.body.body).toBeUndefined();
  });

  it('leaves a body of another type unparsed', async () => {
    const response = await request(app(100))
      .post('/x')
      .set('Content-Type', 'text/plain')
      .send('{}');

    expect(response.status).toBe(200);
    expect(response.body.body).toBeUndefined();
  });

  it('refuses a body over the limit with entity.too.large', async () => {
    const response = await request(app(10))
      .post('/x')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ a: 'x'.repeat(50) }));

    expect(response.body).toEqual({ type: 'entity.too.large' });
  });

  it('refuses broken JSON with entity.parse.failed', async () => {
    const response = await request(app(100))
      .post('/x')
      .set('Content-Type', 'application/json')
      .send('{"a":');

    expect(response.body).toEqual({ type: 'entity.parse.failed' });
  });
});

describe('onlyParsedBodies', () => {
  function run(req: Record<string, unknown>) {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    onlyParsedBodies()(req as unknown as Request, res as unknown as Response, next);
    return { res, next };
  }

  const refused = { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Only JSON bodies are accepted' };

  it.each([
    ['a GET with a body', { method: 'GET', headers: { 'content-length': '5' } }],
    ['a HEAD with a chunked body', { method: 'HEAD', headers: { 'transfer-encoding': 'chunked' } }],
    ['a POST without a body', { method: 'POST', headers: {} }],
    ['a POST with an empty body', { method: 'POST', headers: { 'content-length': '0' } }],
    [
      'a POST with a JSON body',
      { method: 'POST', headers: { 'content-length': '5', 'content-type': 'application/json' } },
    ],
    [
      'a POST with an application/json5 body',
      { method: 'POST', headers: { 'content-length': '5', 'content-type': 'application/json5' } },
    ],
    [
      'a chunked POST with a capitalised JSON type and a charset',
      {
        method: 'POST',
        headers: {
          'transfer-encoding': 'chunked',
          'content-type': 'Application/JSON; charset=utf-8',
        },
      },
    ],
  ])('lets %s through', (_label, req) => {
    const { res, next } = run(req);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a POST with an unparsed text/plain body',
      { method: 'POST', headers: { 'content-length': '5' } },
    ],
    [
      'a chunked POST that was not parsed',
      { method: 'POST', headers: { 'transfer-encoding': 'chunked' } },
    ],
    ['a DELETE with an unparsed body', { method: 'DELETE', headers: { 'content-length': '2' } }],
    [
      'a POST with a text/plain body',
      { method: 'POST', headers: { 'content-length': '5', 'content-type': 'text/plain' } },
    ],
    [
      'a POST with json only in a parameter',
      {
        method: 'POST',
        headers: { 'content-length': '5', 'content-type': 'text/plain; note=json' },
      },
    ],
    [
      'a chunked form POST',
      {
        method: 'POST',
        headers: {
          'transfer-encoding': 'chunked',
          'content-type': 'application/x-www-form-urlencoded',
        },
      },
    ],
  ])('answers 415 for %s', (_label, req) => {
    const { res, next } = run(req);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(415);
    expect(res.json).toHaveBeenCalledWith(refused);
  });

  it('works behind authBody: text/plain 415, JSON and no body pass', async () => {
    const app = express();
    app.post('/x', authBody(100), onlyParsedBodies(), (_req, res) => {
      res.json({ reached: true });
    });

    const text = await request(app).post('/x').set('Content-Type', 'text/plain').send('hello');
    const json = await request(app).post('/x').set('Content-Type', 'application/json5').send('{}');
    const none = await request(app).post('/x');

    expect(text.status).toBe(415);
    expect(text.body).toEqual(refused);
    expect(json.status).toBe(200);
    expect(none.status).toBe(200);
  });

  it('answers 415 for an unsupported charset through the error handler', async () => {
    const app = express();
    app.post('/x', authBody(100), onlyParsedBodies(), (_req, res) => {
      res.json({ reached: true });
    });
    app.use(authErrorHandler(loggerStub()));

    const response = await request(app)
      .post('/x')
      .set('Content-Type', 'application/json; charset=koi8-r')
      .send('{"a":1}');

    expect(response.status).toBe(415);
    expect(response.body).toEqual(refused);
  });
});

describe('authTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function exchange(headersSent = false) {
    const handlers: Record<string, () => void> = {};
    const res = {
      headersSent,
      locals: {} as Record<string, unknown>,
      on: vi.fn((event: string, handler: () => void) => {
        handlers[event] = handler;
      }),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();
    return { res, next, close: () => handlers.close?.() };
  }

  function start(middleware: ReturnType<typeof authTimeout>, e = exchange()) {
    middleware({ path: '/api/auth/x' } as Request, e.res as unknown as Response, e.next);
    return e;
  }

  it('calls next at once and does nothing before the time is up', () => {
    const e = start(authTimeout(1000, loggerStub()));

    vi.advanceTimersByTime(999);

    expect(e.next).toHaveBeenCalledTimes(1);
    expect(e.res.status).not.toHaveBeenCalled();
  });

  it('answers 503 SERVICE_UNAVAILABLE after the time, marks the response and logs a warning', () => {
    vi.setSystemTime(10_000);
    const logger = loggerStub();
    const e = start(authTimeout(1000, logger));

    vi.advanceTimersByTime(1000);

    expect(e.res.status).toHaveBeenCalledWith(503);
    expect(e.res.json).toHaveBeenCalledWith({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The request took longer than 1000 ms',
    });
    expect(e.res.locals.authTimedOut).toEqual({ started: 10_000 });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('reports only the first timeout within a minute to Sentry, the next after it', () => {
    const middleware = authTimeout(1000, loggerStub());

    start(middleware);
    start(middleware);
    vi.advanceTimersByTime(1000);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);

    start(middleware);
    vi.advanceTimersByTime(59_000);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);

    start(middleware);
    vi.advanceTimersByTime(1000);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(2);
  });

  it('still answers and logs every timeout', () => {
    const logger = loggerStub();
    const middleware = authTimeout(1000, logger);
    const a = start(middleware);
    const b = start(middleware);

    vi.advanceTimersByTime(1000);

    expect(a.res.status).toHaveBeenCalledWith(503);
    expect(b.res.status).toHaveBeenCalledWith(503);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('does not answer, mark or report once the response has started', () => {
    const logger = loggerStub();
    const e = start(authTimeout(1000, logger), exchange(true));

    vi.advanceTimersByTime(2000);

    expect(e.res.status).not.toHaveBeenCalled();
    expect(e.res.locals.authTimedOut).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('clears the timer when the response closes', () => {
    const logger = loggerStub();
    const e = start(authTimeout(1000, logger));

    e.close();
    vi.advanceTimersByTime(5000);

    expect(e.res.status).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
