import { fromNodeHeaders } from 'better-auth/node';

import { SessionUnavailableError } from '../common/errors/app.exception.js';
import type { SessionReader, SessionRequest } from '../common/http/request-context.js';
import { type Auth, SESSION_COOKIE } from './auth.js';

// Better Auth's own route (mount-auth.ts) reads the session itself, and its answers keep its own
// format (N26): the request context does not read it there. Express matches routes ignoring case.
const AUTH_ROUTE = /^\/api\/auth\//i;
// The session cookie in a Cookie header, with the `__Secure-` prefix it has on https. A request with
// other cookies only (consent, the cached copy alone) reads nothing (N29).
const HAS_SESSION_COOKIE = new RegExp(
  `(?:^|;)\\s*(?:__Secure-)?${SESSION_COOKIE.replaceAll('.', '\\.')}=`,
);

// How long a session read may take (N29). It runs ahead of the guards, so TimeoutInterceptor does
// not reach it; fixed and short, like the Redis client's command timeout.
export const SESSION_READ_TIMEOUT_MS = 2_000;
// Session reads in progress at once in this process, slow ones past their timeout included (N29):
// with the database down, abandoned reads would otherwise pile up in the pool's queue.
export const MAX_SESSION_READS = 20;
// At most one failed read per this interval goes to Sentry (N29), as with timeouts (spec 0006 F29).
const REPORT_INTERVAL_MS = 60_000;
// What the timer rejects with, told apart from the read's own failure.
const TIMED_OUT = Symbol('timed out');

// The reader with its shares: `share(n)` is a reader of the same cap, timeout and Sentry interval
// that also keeps at most n of its own reads in progress, counted until each read itself ends, so
// one kind of caller cannot take the whole cap from the others (the sockets', N42). One more is
// refused at once with a SessionUnavailableError that is not reported.
export type SharedSessionReader = SessionReader & { share: (maxReads: number) => SessionReader };

interface Share {
  readonly maxReads: number;
  reads: number;
}

export interface SessionReaderOptions {
  timeoutMs?: number;
  maxReads?: number;
  // The clock of the Sentry interval; tests pass their own.
  now?: () => number;
}

// The signed-in user of a request, for the request context (spec 0013 plan §4). The signed copy of
// the session in a cookie answers without the database for 5 minutes (N18). No refresh here: the
// refreshed cookies would have to ride on the api's answer; web's client extends the session
// through /api/auth/get-session (N30). A cookie with a bad signature or an expired session is no
// user. A read that fails (the database), takes longer than the timeout or finds MAX_SESSION_READS
// reads still running rejects with 503 SERVICE_UNAVAILABLE, which web's queries retry (N29); a slow
// read is not cancelled and counts until it ends. AppExceptionFilter (for a socket, SocketIoAdapter)
// logs the first within a minute with its cause (through loggable()) and reports it to Sentry; the
// rest are warnings without it.
export function sessionReader(auth: Auth, options: SessionReaderOptions = {}): SharedSessionReader {
  const timeoutMs = options.timeoutMs ?? SESSION_READ_TIMEOUT_MS;
  const maxReads = options.maxReads ?? MAX_SESSION_READS;
  const now = options.now ?? Date.now;
  let reads = 0;
  let reportedAt: number | undefined;

  const unavailable = (message: string, cause?: unknown): SessionUnavailableError => {
    const time = now();
    const report = reportedAt === undefined || time - reportedAt >= REPORT_INTERVAL_MS;
    if (report) reportedAt = time;
    return new SessionUnavailableError(message, report, cause);
  };

  const readSession = async (
    req: SessionRequest,
    share?: Share,
  ): Promise<{ userId: string; sessionId: string } | undefined> => {
    const { cookie } = req.headers;
    if (cookie === undefined || !HAS_SESSION_COOKIE.test(cookie) || AUTH_ROUTE.test(req.path)) {
      return undefined;
    }
    // The share's own limit first: it is no failure of the database, so the log only, never Sentry,
    // and it must not take the Sentry interval of HTTP's next 503 even when the cap is full too.
    if (share !== undefined && share.reads >= share.maxReads) {
      throw new SessionUnavailableError(
        `${share.maxReads} session reads of this share are already in progress`,
        false,
      );
    }
    if (reads >= maxReads) {
      throw unavailable(`${maxReads} session reads are already in progress`);
    }
    // Counted once the read exists (a synchronous throw takes no slot), and counted down when the
    // read itself ends, not when the request gives up on it.
    let read: ReturnType<Auth['api']['getSession']>;
    try {
      read = auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
        query: { disableRefresh: true },
      });
    } catch (error) {
      throw unavailable('The session could not be read', error);
    }
    reads += 1;
    if (share !== undefined) share.reads += 1;
    const ended = (): void => {
      reads -= 1;
      if (share !== undefined) share.reads -= 1;
    };
    void read.then(ended, ended);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(TIMED_OUT);
      }, timeoutMs);
    });
    try {
      const found = await Promise.race([read, timeout]);
      return found === null ? undefined : { userId: found.user.id, sessionId: found.session.id };
    } catch (error) {
      // Only the error this request answers with takes the Sentry interval: a read that fails
      // after its request timed out answers no one.
      throw error === TIMED_OUT
        ? unavailable(`The session read took longer than ${timeoutMs} ms`)
        : unavailable('The session could not be read', error);
    } finally {
      clearTimeout(timer);
    }
  };

  return Object.assign((req: SessionRequest) => readSession(req), {
    share: (shareMaxReads: number): SessionReader => {
      const share: Share = { maxReads: shareMaxReads, reads: 0 };
      return (req) => readSession(req, share);
    },
  });
}
