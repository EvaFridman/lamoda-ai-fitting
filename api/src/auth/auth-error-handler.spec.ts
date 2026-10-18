import * as Sentry from '@sentry/nestjs';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

import { requestContextMiddleware } from '../common/http/request-context.js';
import type { AuthLogger } from './auth.js';
import { AUTH_INTERNAL_ERROR, authErrorHandler } from './auth-error-handler.js';

vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: vi.fn(),
}));

function loggerStub(): { [K in keyof AuthLogger]: Mock<AuthLogger[K]> } {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function appThrowing(error: unknown, logger: AuthLogger, withContext = true) {
  const app = express();
  if (withContext) {
    app.use(requestContextMiddleware({ proxySecret: 'secret-secret', adminToken: 'admin-token' }));
  }
  app.get('/api/auth/boom', (_req, _res, next) => {
    next(error);
  });
  app.use(authErrorHandler(logger));
  return app;
}

describe('authErrorHandler', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers 500 with Better Auth-shaped code and message, nothing of the error', async () => {
    const error = new Error('insert into users (email) values ("secret@example.com") failed');

    const response = await request(appThrowing(error, loggerStub())).get('/api/auth/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    expect(response.body).toEqual(AUTH_INTERNAL_ERROR);
    expect(response.text).not.toContain('secret@example.com');
  });

  it('logs the error once with the request id', async () => {
    const logger = loggerStub();

    const response = await request(appThrowing(new Error('db down'), logger)).get('/api/auth/boom');

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: response.headers['x-request-id'] }),
      'Internal server error',
    );
  });

  it('logs without the request id when the request has no context', async () => {
    const logger = loggerStub();

    await request(appThrowing(new Error('db down'), logger, false)).get('/api/auth/boom');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: undefined }),
      'Internal server error',
    );
  });

  it('reports the error to Sentry with its code', async () => {
    const error = new Error('db down');

    await request(appThrowing(error, loggerStub())).get('/api/auth/boom');

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { 'error.code': 'INTERNAL_SERVER_ERROR' },
    });
  });

  it('logs, closes the connection and does not answer once the response has started', () => {
    const logger = loggerStub();
    const error = new Error('late');
    const res = {
      headersSent: true,
      locals: {},
      destroy: vi.fn(),
      status: vi.fn(),
      json: vi.fn(),
    };
    const next = vi.fn();

    authErrorHandler(logger)(error, {} as Request, res as unknown as Response, next);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: 'late' }) }),
      'Internal server error',
    );
    expect(res.destroy).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  describe('a request that timed out (authTimeout)', () => {
    it('only logs the late end with its duration: no answer, no destroy, no Sentry', () => {
      vi.useFakeTimers();
      vi.setSystemTime(5000);
      const logger = loggerStub();
      const res = {
        headersSent: true,
        locals: { authTimedOut: { started: 1000 } },
        destroy: vi.fn(),
        status: vi.fn(),
        json: vi.fn(),
      };

      authErrorHandler(logger)(
        new Error('write after end'),
        {} as Request,
        res as unknown as Response,
        vi.fn(),
      );
      vi.useRealTimers();

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ durationMs: 4000 }),
        'A /api/auth request that timed out has ended',
      );
      expect(logger.error).not.toHaveBeenCalled();
      expect(res.destroy).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('a body the parser refused', () => {
    const tooLarge = Object.assign(new Error('too large'), {
      type: 'entity.too.large',
      status: 413,
      expose: true,
    });
    const broken = Object.assign(new Error('bad json'), {
      type: 'entity.parse.failed',
      status: 400,
      expose: true,
    });

    function appFailingWith(error: unknown, logger: AuthLogger) {
      const app = express();
      app.get('/api/auth/body', (_req, _res, next) => {
        next(error);
      });
      app.use(authErrorHandler(logger));
      return app;
    }

    it('answers 413 PAYLOAD_TOO_LARGE, logs a warning and reports nothing', async () => {
      const logger = loggerStub();

      const response = await request(appFailingWith(tooLarge, logger)).get('/api/auth/body');

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The body is too large',
      });
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('answers 400 BAD_REQUEST for broken JSON', async () => {
      const response = await request(appFailingWith(broken, loggerStub())).get('/api/auth/body');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid JSON in request body',
      });
    });

    it('still answers 500 for an error that is not a client error', async () => {
      const response = await request(appFailingWith(new Error('db'), loggerStub())).get(
        '/api/auth/body',
      );

      expect(response.status).toBe(500);
    });

    it('closes the connection instead when the response has started', () => {
      const logger = loggerStub();
      const res = {
        headersSent: true,
        locals: {},
        destroy: vi.fn(),
        status: vi.fn(),
        json: vi.fn(),
      };

      authErrorHandler(logger)(tooLarge, {} as Request, res as unknown as Response, vi.fn());

      expect(res.destroy).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
