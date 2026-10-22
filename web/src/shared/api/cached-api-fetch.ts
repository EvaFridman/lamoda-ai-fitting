import 'server-only';

import { cacheLife } from 'next/cache';
import type { z } from 'zod';

import { getServerEnv } from '@/shared/config/server';

import { ApiError, type ApiErrorDetail, type ApiErrorKind } from './api-error';
import { apiUrl, SERVER_TIMEOUT_MS } from './api-fetch';
import { callApi, type Parsed } from './call-api';
import type { ApiPath } from './path';

// An `ApiError`'s fields, which pass through the cache's serialization where the class would not.
export interface CachedFailure {
  message: string;
  kind: ApiErrorKind;
  template: string;
  method?: string;
  status?: number;
  code?: string;
  details: ApiErrorDetail[];
}

export type CachedRead<T> = { data: T } | { failure: CachedFailure };

// How long a cached read stays (spec 0018 V3, plan §3): fresh for `PAGE_CACHE_REVALIDATE_SECONDS`,
// then served while the next request refreshes it, and gone after an hour unused.
function pageCacheLife() {
  return { stale: 60, revalidate: getServerEnv().PAGE_CACHE_REVALIDATE_SECONDS, expire: 3600 };
}

// The page cache's read of a public catalog route (spec 0018 plan §3, AC3): `apiFetch`'s address,
// timeout, schema and error steps without anything of the visitor (no address, request id or
// `X-Proxy-Secret`), so the api counts it under web's own address (V15). Only inside a
// `'use cache: remote'` function, whose arguments must hold nothing but the query.
//
// A failure is answered, not thrown (V23): Next would hand the caller a plain `Error` in place of
// the `ApiError`. Its lifetime of 0 keeps the entry out of the cache (the shortest `cacheLife`
// wins; the handler stores no `expire` of 0). `callApi` has reported it; `cachedData` rethrows it.
export async function cachedApiFetch<Schema extends z.ZodType>(
  path: ApiPath,
  schema: Schema,
): Promise<CachedRead<Parsed<Schema>>> {
  cacheLife(pageCacheLife());
  try {
    const data = await callApi(apiUrl(path), path, schema, {
      redirect: 'error',
      signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
    });
    return { data };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    cacheLife({ revalidate: 0, expire: 0 });
    const { message, kind, template, method, status, code, details } = error;
    return { failure: { message, kind, template, method, status, code, details } };
  }
}

// The handler's `SKIP_UNTIL` slot (`shared/page-cache/handler.mts`, outside the bundle, so named
// again here): until when it skips Redis.
const SKIP_UNTIL = Symbol.for('lamoda-ai-fitting.page-cache.skip-until');

// Whether a read may go through the page cache now. While the handler skips Redis (down, slow, still
// connecting) a cached function would miss every time and every miss would count under web's own
// address: one quota for all visitors (V24). So the callers read on the visitor's behalf
// meanwhile; once the skip ends the next read goes through the cache again and probes it.
export function pageCacheOpen(): boolean {
  const until = (globalThis as Record<symbol, unknown>)[SKIP_UNTIL];
  return typeof until !== 'number' || Date.now() >= until;
}

// A cached read's data, or its failure thrown again as the `ApiError` it was.
export function cachedData<T>(read: CachedRead<T>): T {
  if ('data' in read) return read.data;
  const { message, ...init } = read.failure;
  throw new ApiError(message, init);
}
