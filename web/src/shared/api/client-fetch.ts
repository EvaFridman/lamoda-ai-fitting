import type { z } from 'zod';

import { ApiError } from './api-error';
import { callApi } from './call-api';
import type { ApiPath } from './path';

// Above the api's own 10 s timeout, so its 503 arrives first and shows its text (plan §4).
const TIMEOUT_MS = 15_000;

// The site's own path to the api in every environment (H6): nginx serves it in production, the
// dev rewrite in next.config.ts locally. It strips the prefix, as nginx does.
const API_PREFIX = '/api';

// The timeout, or the caller's signal and the timeout, whichever fires first, with that signal's
// reason (`TimeoutError` or `AbortError`), so `callApi` tells a timeout from a cancel. By hand, not
// `AbortSignal.any`: Next's browser targets (Safari 16.4, Chrome 111) do not have it.
function requestSignal(caller: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  if (!caller) return timeout;
  const controller = new AbortController();
  for (const source of [caller, timeout]) {
    if (source.aborted) {
      controller.abort(source.reason);
      break;
    }
    source.addEventListener('abort', () => controller.abort(source.reason), { once: true });
  }
  return controller.signal;
}

// The only way browser code calls the api: same origin, no secret and no forwarded headers (the
// visitor's own request reaches nginx), with a timeout and the response checked against a schema.
// `init.signal` (TanStack Query's, when a query is cancelled) stops the request too.
export async function clientFetch<Schema extends z.ZodType>(
  path: ApiPath,
  schema: Schema,
  init?: RequestInit,
): Promise<z.infer<Schema>> {
  const origin = globalThis.location.origin;
  const url = new URL(API_PREFIX + path.path, origin);
  // `buildPath` makes only relative paths; the prefix keeps even a forged `//host` path on this
  // origin, and the check holds if that ever changes.
  if (url.origin !== origin) {
    throw new ApiError(`path leaves the site: ${url.host}`, {
      kind: 'path',
      template: path.template,
    });
  }
  return callApi(url, path, schema, {
    ...init,
    redirect: 'error',
    signal: requestSignal(init?.signal),
  });
}
