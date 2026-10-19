import { z } from 'zod';

import { ApiError, type ApiErrorKind, AUTH_TEMPLATE_PREFIX, reportApiError } from '@/shared/api';

// As clientFetch's: a sign-in or sign-out that has not answered by then is a timeout.
const TIMEOUT_MS = 15_000;

const codeSchema = z.string().max(64);

// The two formats of /api/auth's errors: the api's, for its own 429 and nginx's 413, 429 and
// 502/504 as 503 (N32), and Better Auth's `{ code, message }` for everything else (N17).
const apiFormatSchema = z.object({ error: z.object({ code: codeSchema }) });
const authFormatSchema = z.object({ code: codeSchema });
const statusSchema = z.object({ status: z.number().int() });

// The routes of /api/auth web calls (the api answers only its list, N25).
export type AuthRoute = 'get-session' | 'sign-in/social' | 'sign-out' | 'revoke-sessions';

// What Better Auth's client returns for an answer that is not 2xx: the body's fields, if it was
// JSON, with the status.
export interface AuthErrorAnswer {
  status: number;
}

function codeOf(answer: unknown): string | undefined {
  const api = apiFormatSchema.safeParse(answer);
  if (api.success) return api.data.error.code;
  const auth = authFormatSchema.safeParse(answer);
  return auth.success ? auth.data.code : undefined;
}

// A failure of a Better Auth call as an `ApiError`, reported as `callApi` reports its own: so
// `errorText` gives its Russian text (its template starts with AUTH_TEMPLATE_PREFIX) and Sentry
// hears of an outage, once per cause per minute. An `Error` is a call that got no answer; anything
// else is the client's error answer.
export function authFailure(failure: unknown, route: AuthRoute, method: string): ApiError {
  const template = AUTH_TEMPLATE_PREFIX + route;
  let error: ApiError;
  if (failure instanceof Error) {
    const kind: ApiErrorKind = failure.name === 'TimeoutError' ? 'timeout' : 'network';
    error = new ApiError(`auth ${kind}: ${template}: ${String(failure)}`, {
      kind,
      template,
      method,
      cause: failure,
    });
  } else {
    const parsed = statusSchema.safeParse(failure);
    const status = parsed.success ? parsed.data.status : 0;
    error = new ApiError(`auth answered ${status}: ${template}`, {
      kind: 'http',
      template,
      method,
      status,
      code: codeOf(failure),
    });
  }
  reportApiError(error);
  return error;
}

export interface CallAuthOptions {
  // An answer status the caller expects and treats as done: neither thrown nor reported.
  acceptStatus?: number;
}

// Runs a sign-in or sign-out call of the client with a timeout, and throws its failure as an
// `ApiError` (`authFailure`).
export async function callAuth(
  route: AuthRoute,
  method: string,
  call: (fetchOptions: { signal: AbortSignal }) => Promise<{ error: AuthErrorAnswer | null }>,
  { acceptStatus }: CallAuthOptions = {},
): Promise<void> {
  let result: { error: AuthErrorAnswer | null };
  try {
    result = await call({ signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (failure) {
    throw authFailure(
      failure instanceof Error ? failure : new Error(String(failure)),
      route,
      method,
    );
  }
  if (result.error && result.error.status !== acceptStatus) {
    throw authFailure(result.error, route, method);
  }
}
