import 'server-only';

import { isIP } from 'node:net';

import { headers } from 'next/headers';
import type { z } from 'zod';

import { getServerEnv } from '@/shared/config/server';

import { ApiError } from './api-error';
import { callApi, type Parsed } from './call-api';
import type { ApiPath } from './path';

const TIMEOUT_MS = 5000;

// nginx's $request_id: 32 hex characters, the only form the api takes.
const REQUEST_ID = /^[\da-f]{32}$/i;

// The headers only apiFetch sets: with the secret, the api believes the other two.
const PROXY_HEADERS = ['X-Proxy-Secret', 'X-Forwarded-For', 'X-Request-Id'];

// The visitor's address, as nginx reported it to this server. Without it the api would see every
// server-side call as coming from the web container, and all visitors would share one rate limit.
// nginx overwrites X-Real-IP / X-Forwarded-For with the client address, so a visitor cannot forge
// it in production; locally there is no nginx and the web container's address is used. Anything
// but a single address is dropped: the api would not take it either.
function visitorAddress(incoming: Headers): string | undefined {
  const address =
    incoming.get('x-real-ip')?.trim() || incoming.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return address && isIP(address) !== 0 ? address : undefined;
}

// The id nginx gave the page request, so the api's log lines for its calls carry the same one.
function requestId(incoming: Headers): string | undefined {
  const id = incoming.get('x-request-id')?.trim();
  return id && REQUEST_ID.test(id) ? id : undefined;
}

// The only way server code calls the api: over the internal network (API_URL), on behalf of the
// visitor (their address and the request id forwarded, vouched for by the proxy secret), with a
// timeout, and with the response checked against a schema, so a changed api fails here and not deep
// in a page. Request-time only: it reads the incoming request's headers.
export async function apiFetch<Schema extends z.ZodType>(
  path: ApiPath,
  schema: Schema,
  init?: RequestInit,
): Promise<Parsed<Schema>> {
  const env = getServerEnv();
  const url = new URL(path.path, env.API_URL);
  // `buildPath` makes only paths on the api's origin; this holds even for a forged ApiPath, since
  // an absolute or `//host` path would leave API_URL, and the secret with it.
  if (url.origin !== new URL(env.API_URL).origin) {
    throw new ApiError(`path leaves the api: ${url.host}`, {
      kind: 'path',
      template: path.template,
    });
  }
  const requestHeaders = new Headers(init?.headers);
  for (const name of PROXY_HEADERS) requestHeaders.delete(name);
  const incoming = await headers();
  if (env.PROXY_SECRET) requestHeaders.set('X-Proxy-Secret', env.PROXY_SECRET);
  const visitor = visitorAddress(incoming);
  if (visitor) requestHeaders.set('X-Forwarded-For', visitor);
  const id = requestId(incoming);
  if (id) requestHeaders.set('X-Request-Id', id);
  return callApi(
    url,
    path,
    schema,
    {
      ...init,
      headers: requestHeaders,
      // A redirect to another host would take the secret along: fetch drops only its own
      // credential headers.
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
    // The same id as the api's log lines and Sentry events for this call.
    { requestId: id },
  );
}
