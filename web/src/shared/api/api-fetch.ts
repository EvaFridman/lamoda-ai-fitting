import 'server-only';

import { headers } from 'next/headers';
import type { z } from 'zod';

import { getServerEnv } from '@/shared/config';

const TIMEOUT_MS = 5000;

// The visitor's address, as nginx reported it to this server. Without it the api would see every
// server-side call as coming from the web container, and all visitors would share one rate limit.
// nginx overwrites X-Real-IP / X-Forwarded-For with the client address, so a visitor cannot forge
// it in production; locally there is no nginx and the web container's address is used.
async function visitorAddress(): Promise<string | undefined> {
  const incoming = await headers();
  const realIp = incoming.get('x-real-ip');
  if (realIp) return realIp;
  return incoming.get('x-forwarded-for')?.split(',').at(-1)?.trim() || undefined;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// The only way server code calls the api: over the internal network (API_URL), on behalf of the
// visitor (their address forwarded for rate limiting), with a timeout, and with the response checked
// against a schema, so a changed api fails here and not deep in a page. Request-time only: it reads
// the incoming request's headers.
export async function apiFetch<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  init?: RequestInit,
): Promise<z.infer<Schema>> {
  const url = new URL(path, getServerEnv().API_URL);
  const requestHeaders = new Headers(init?.headers);
  const visitor = await visitorAddress();
  if (visitor) requestHeaders.set('X-Forwarded-For', visitor);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: requestHeaders,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ApiError(`api unreachable: ${url.pathname}: ${String(error)}`);
  }
  if (!response.ok) {
    throw new ApiError(`api answered ${response.status}: ${url.pathname}`, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(`unexpected api response: ${url.pathname}: ${parsed.error.message}`);
  }
  return parsed.data;
}
