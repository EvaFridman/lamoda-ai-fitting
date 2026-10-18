import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppException, SessionUnavailableError } from '../common/errors/app.exception.js';
import type { Auth } from './auth.js';
import { sessionReader } from './session-reader.js';

const getSession = vi.fn();
const auth = { api: { getSession } } as unknown as Auth;

function requestOf(path: string, cookie?: string): Request {
  return { path, headers: cookie === undefined ? {} : { cookie } } as unknown as Request;
}

describe('sessionReader', () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it('does not ask Better Auth for a request without a Cookie header', async () => {
    const user = await sessionReader(auth)(requestOf('/products'));

    expect(user).toBeUndefined();
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each([
    'cookie-consent=yes',
    'lamoda.session_data=x',
    'xlamoda.session_token=1',
    'lamoda.session_tokenx=1',
  ])('does not ask Better Auth when the cookies are only %s', async (cookie) => {
    const user = await sessionReader(auth)(requestOf('/products', cookie));

    expect(user).toBeUndefined();
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each([
    'a=1; lamoda.session_token=t',
    'a=1;lamoda.session_token=t',
    '__Secure-lamoda.session_token=t',
    'lamoda.session_token=t',
  ])('asks Better Auth when the cookies are %s', async (cookie) => {
    getSession.mockResolvedValue(null);

    await sessionReader(auth)(requestOf('/products', cookie));

    expect(getSession).toHaveBeenCalledOnce();
  });

  it.each(['/api/auth/get-session', '/API/AUTH/get-session', '/Api/Auth/sign-out'])(
    'does not ask Better Auth on its own route %s',
    async (path) => {
      const user = await sessionReader(auth)(requestOf(path, 'lamoda.session_token=abc'));

      expect(user).toBeUndefined();
      expect(getSession).not.toHaveBeenCalled();
    },
  );

  it('asks for a path that only looks like the auth route', async () => {
    getSession.mockResolvedValue(null);

    await sessionReader(auth)(requestOf('/products/api/auth/x', 'lamoda.session_token=abc'));

    expect(getSession).toHaveBeenCalledOnce();
  });

  it('is undefined when Better Auth finds no session', async () => {
    getSession.mockResolvedValue(null);

    const user = await sessionReader(auth)(requestOf('/products', 'lamoda.session_token=abc'));

    expect(user).toBeUndefined();
  });

  it('answers the ids of the found user and session, nothing else', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', email: 'a@example.com', name: 'Анна' },
      session: { id: 'session-1', token: 'secret-token' },
    });

    const user = await sessionReader(auth)(requestOf('/products', 'lamoda.session_token=abc'));

    expect(user).toEqual({ userId: 'user-1', sessionId: 'session-1' });
  });

  it('passes the cookie and disables the session refresh', async () => {
    getSession.mockResolvedValue(null);

    await sessionReader(auth)(requestOf('/products', 'lamoda.session_token=abc'));

    const [options] = getSession.mock.calls[0] as [{ headers: Headers; query: unknown }];
    expect(options.query).toEqual({ disableRefresh: true });
    expect(options.headers.get('cookie')).toBe('lamoda.session_token=abc');
  });

  describe('when the read fails or is slow (N29)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects with 503 SERVICE_UNAVAILABLE, keeps the cause and does not leak it', async () => {
      const original = new Error('database is down');
      getSession.mockRejectedValue(original);

      const failure: unknown = await sessionReader(auth)(
        requestOf('/products', 'lamoda.session_token=abc'),
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AppException);
      const exception = failure as AppException;
      expect(exception.code).toBe('SERVICE_UNAVAILABLE');
      expect(exception.getStatus()).toBe(503);
      expect(exception.message).toBe('The session could not be read');
      expect(exception.message).not.toContain('database is down');
      expect(JSON.stringify(exception.body)).not.toContain('database is down');
      expect(exception.cause).toBe(original);
    });

    it('rejects with 503 after timeoutMs when the read never settles', async () => {
      vi.useFakeTimers();
      getSession.mockReturnValue(new Promise(() => undefined));

      const failure = sessionReader(auth, { timeoutMs: 500 })(
        requestOf('/products', 'lamoda.session_token=abc'),
      );
      const caught = failure.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(499);
      let settled = false;
      void caught.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const exception = (await caught) as AppException;
      expect(exception).toBeInstanceOf(AppException);
      expect(exception.code).toBe('SERVICE_UNAVAILABLE');
      expect(exception.message).toBe('The session read took longer than 500 ms');
    });

    it('uses 2000 ms by default', async () => {
      vi.useFakeTimers();
      getSession.mockReturnValue(new Promise(() => undefined));

      const caught = sessionReader(auth)(requestOf('/products', 'lamoda.session_token=abc')).catch(
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(2000);

      expect(((await caught) as AppException).message).toBe(
        'The session read took longer than 2000 ms',
      );
    });

    it('leaves no timer behind after a fast read, found or not, or a failed one', async () => {
      vi.useFakeTimers();
      const request = requestOf('/products', 'lamoda.session_token=abc');

      getSession.mockResolvedValue(null);
      await sessionReader(auth)(request);
      getSession.mockResolvedValue({ user: { id: 'u' }, session: { id: 's' } });
      await sessionReader(auth)(request);
      getSession.mockRejectedValue(new Error('boom'));
      await sessionReader(auth)(request).catch(() => undefined);

      expect(vi.getTimerCount()).toBe(0);
    });

    it('causes no unhandled rejection when the read fails after the timeout', async () => {
      vi.useFakeTimers();
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        let fail: (error: Error) => void = () => undefined;
        getSession.mockReturnValue(
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
        );

        const caught = sessionReader(auth, { timeoutMs: 100 })(
          requestOf('/products', 'lamoda.session_token=abc'),
        ).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(100);
        expect(await caught).toBeInstanceOf(AppException);
        fail(new Error('late failure'));
        await vi.advanceTimersByTimeAsync(10);
        await new Promise<void>((resolve) => process.nextTick(resolve));

        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });
  });

  describe('Sentry interval and the cap on reads in progress (N29)', () => {
    const request = requestOf('/products', 'lamoda.session_token=abc');

    afterEach(() => {
      vi.useRealTimers();
    });

    async function failure(read: Promise<unknown>): Promise<SessionUnavailableError> {
      const error = await read.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SessionUnavailableError);
      return error as SessionUnavailableError;
    }

    it('reports the first failure, then one per 60 s, shared by failures, timeouts and refusals', async () => {
      vi.useFakeTimers();
      let time = 1_000_000;
      const reader = sessionReader(auth, { timeoutMs: 100, maxReads: 1, now: () => time });
      getSession.mockRejectedValueOnce(new Error('db'));

      const first = await failure(reader(request));
      time += 30_000;
      getSession.mockReturnValueOnce(new Promise(() => undefined));
      const timeoutAssert = failure(reader(request));
      await vi.advanceTimersByTimeAsync(100);
      const second = await timeoutAssert;
      time += 29_999;
      const refused = await failure(reader(request));
      time += 1;
      const third = await failure(reader(request));
      time += 1;
      const afterRefusal = await failure(reader(request));

      expect(first.report).toBe(true);
      expect(second.report).toBe(false);
      expect(refused.report).toBe(false);
      expect(third.report).toBe(true);
      expect(afterRefusal.report).toBe(false);
    });

    it('reports again exactly after 60 s', async () => {
      let time = 0;
      const reader = sessionReader(auth, { now: () => time });
      getSession.mockRejectedValue(new Error('db'));

      const reports = [];
      for (const step of [0, 59_999, 1]) {
        time += step;
        reports.push((await failure(reader(request))).report);
      }

      expect(reports).toEqual([true, false, true]);
    });

    it('refuses at once the read after maxReads still running, without calling getSession', async () => {
      getSession.mockReturnValue(new Promise(() => undefined));
      const reader = sessionReader(auth, { maxReads: 2, timeoutMs: 60_000 });
      void reader(request).catch(() => undefined);
      void reader(request).catch(() => undefined);

      const refused = await failure(reader(request));

      expect(refused.message).toBe('2 session reads are already in progress');
      expect(refused.code).toBe('SERVICE_UNAVAILABLE');
      expect(getSession).toHaveBeenCalledTimes(2);
    });

    it('allows a new read once a held one settles', async () => {
      let release: (value: null) => void = () => undefined;
      getSession.mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      getSession.mockReturnValueOnce(new Promise(() => undefined));
      const reader = sessionReader(auth, { maxReads: 2, timeoutMs: 60_000 });
      const held = reader(request);
      void reader(request).catch(() => undefined);
      await failure(reader(request));

      release(null);
      await held;
      getSession.mockResolvedValue(null);

      await expect(reader(request)).resolves.toBeUndefined();
      expect(getSession).toHaveBeenCalledTimes(3);
    });

    it('keeps the slot of a timed-out read until that read ends', async () => {
      vi.useFakeTimers();
      let fail: (error: Error) => void = () => undefined;
      getSession.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
      );
      const reader = sessionReader(auth, { maxReads: 1, timeoutMs: 100 });
      const timedOut = failure(reader(request));
      await vi.advanceTimersByTimeAsync(100);
      expect((await timedOut).message).toBe('The session read took longer than 100 ms');

      const refused = await failure(reader(request));
      expect(refused.message).toBe('1 session reads are already in progress');
      expect(getSession).toHaveBeenCalledTimes(1);

      fail(new Error('late'));
      await vi.advanceTimersByTimeAsync(0);
      getSession.mockResolvedValue(null);

      await expect(reader(request)).resolves.toBeUndefined();
      expect(getSession).toHaveBeenCalledTimes(2);
    });

    it('does not let a read that fails after its request timed out take the Sentry interval', async () => {
      vi.useFakeTimers();
      let time = 0;
      let fail: (error: Error) => void = () => undefined;
      getSession.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
      );
      const reader = sessionReader(auth, { timeoutMs: 100, now: () => time });
      const timedOut = failure(reader(request));
      await vi.advanceTimersByTimeAsync(100);
      expect((await timedOut).report).toBe(true);

      time = 61_000;
      fail(new Error('late'));
      await vi.advanceTimersByTimeAsync(0);
      time = 62_000;
      getSession.mockRejectedValueOnce(new Error('db'));

      expect((await failure(reader(request))).report).toBe(true);
    });

    it('takes no slot when getSession throws synchronously', async () => {
      const original = new Error('x');
      getSession.mockImplementationOnce(() => {
        throw original;
      });
      const reader = sessionReader(auth, { maxReads: 2, timeoutMs: 60_000 });

      const thrown = await failure(reader(request));
      expect(thrown.message).toBe('The session could not be read');
      expect(thrown.getStatus()).toBe(503);
      expect(thrown.report).toBe(true);
      expect(thrown.cause).toBe(original);

      getSession.mockReturnValue(new Promise(() => undefined));
      void reader(request).catch(() => undefined);
      void reader(request).catch(() => undefined);
      expect(getSession).toHaveBeenCalledTimes(3);
      const refused = await failure(reader(request));
      expect(refused.message).toBe('2 session reads are already in progress');
    });

    it('frees the slot of a failed read and keeps the original error as the cause', async () => {
      const original = new Error('db down');
      getSession.mockRejectedValueOnce(original);
      const reader = sessionReader(auth, { maxReads: 1 });

      const error = await failure(reader(request));
      getSession.mockResolvedValue(null);

      expect(error.cause).toBe(original);
      expect(error.message).not.toContain('db down');
      await expect(reader(request)).resolves.toBeUndefined();
    });
  });

  describe('share (N42)', () => {
    const request = requestOf('/socket.io/', 'lamoda.session_token=abc');

    afterEach(() => {
      vi.useRealTimers();
    });

    function hang(): { release: () => void } {
      let release: () => void = () => undefined;
      getSession.mockReturnValueOnce(
        new Promise((resolve) => {
          release = () => {
            resolve(null);
          };
        }),
      );
      return { release };
    }

    async function refusal(read: Promise<unknown>): Promise<SessionUnavailableError> {
      const error = await read.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SessionUnavailableError);
      return error as SessionUnavailableError;
    }

    it('refuses the read over its limit at once, unreported, without calling getSession', async () => {
      const share = sessionReader(auth, { timeoutMs: 60_000 }).share(2);
      hang();
      hang();
      void share(request).catch(() => undefined);
      void share(request).catch(() => undefined);

      const refused = await refusal(share(request));

      expect(refused.report).toBe(false);
      expect(refused.code).toBe('SERVICE_UNAVAILABLE');
      expect(getSession).toHaveBeenCalledTimes(2);
    });

    it('frees a slot only when the underlying read ends, even after its timeout', async () => {
      vi.useFakeTimers();
      const share = sessionReader(auth, { timeoutMs: 100 }).share(1);
      const held = hang();
      const timedOut = refusal(share(request));
      await vi.advanceTimersByTimeAsync(100);
      expect((await timedOut).message).toBe('The session read took longer than 100 ms');

      await refusal(share(request));
      expect(getSession).toHaveBeenCalledTimes(1);

      held.release();
      await vi.advanceTimersByTimeAsync(0);
      getSession.mockResolvedValue(null);

      await expect(share(request)).resolves.toBeUndefined();
      expect(getSession).toHaveBeenCalledTimes(2);
    });

    it('counts its reads against the global cap', async () => {
      const reader = sessionReader(auth, { maxReads: 2, timeoutMs: 60_000 });
      hang();
      hang();
      void reader
        .share(5)(request)
        .catch(() => undefined);
      void reader(request).catch(() => undefined);

      const refused = await refusal(reader(request));

      expect(refused.message).toBe('2 session reads are already in progress');
      expect(getSession).toHaveBeenCalledTimes(2);
    });

    it('checks its own limit before the global cap and leaves the Sentry interval alone', async () => {
      const reader = sessionReader(auth, { maxReads: 2, timeoutMs: 60_000, now: () => 1_000 });
      const share = reader.share(1);
      hang();
      hang();
      void share(request).catch(() => undefined);
      void reader(request).catch(() => undefined);

      const refusedShare = await refusal(share(request));
      const refusedPlain = await refusal(reader(request));

      expect(refusedShare.report).toBe(false);
      expect(refusedShare.message).toBe('1 session reads of this share are already in progress');
      expect(getSession).toHaveBeenCalledTimes(2);
      expect(refusedPlain.message).toBe('2 session reads are already in progress');
      expect(refusedPlain.report).toBe(true);
    });

    it('does not limit plain reads', async () => {
      const reader = sessionReader(auth, { maxReads: 10, timeoutMs: 60_000 });
      hang();
      void reader
        .share(1)(request)
        .catch(() => undefined);
      getSession.mockReturnValue(new Promise(() => undefined));
      for (let i = 0; i < 3; i += 1) void reader(request).catch(() => undefined);

      expect(getSession).toHaveBeenCalledTimes(4);
    });

    it('counts two shares separately', async () => {
      const reader = sessionReader(auth, { timeoutMs: 60_000 });
      const first = reader.share(1);
      const second = reader.share(1);
      getSession.mockReturnValue(new Promise(() => undefined));
      void first(request).catch(() => undefined);

      await refusal(first(request));
      void second(request).catch(() => undefined);

      expect(getSession).toHaveBeenCalledTimes(2);
    });

    it('takes no slot for a request without a session cookie', async () => {
      const share = sessionReader(auth, { timeoutMs: 60_000 }).share(1);
      getSession.mockReturnValue(new Promise(() => undefined));

      await expect(share(requestOf('/socket.io/'))).resolves.toBeUndefined();
      await expect(share(requestOf('/socket.io/', 'cookie-consent=yes'))).resolves.toBeUndefined();
      void share(request).catch(() => undefined);

      expect(getSession).toHaveBeenCalledTimes(1);
    });

    it('answers the user like the plain reader', async () => {
      getSession.mockResolvedValue({ user: { id: 'u' }, session: { id: 's' } });

      await expect(sessionReader(auth).share(1)(request)).resolves.toEqual({
        userId: 'u',
        sessionId: 's',
      });
    });
  });
});
