import * as Sentry from '@sentry/nextjs';

import { ApiError } from './api-error';

// One event per cause per minute: when the api is down every page view fails the same way, and
// web shares the Sentry quota with the api (spec 0004 E33). Per process on the server, per tab in
// the browser.
const WINDOW_MS = 60_000;

const lastSent = new Map<string, number>();

// What the server knows about the page request a failure belongs to.
export interface ReportContext {
  requestId?: string;
}

// Failures that mean a bug or an outage (plan §3): no answer, a wrong answer, a 5xx, and a 401,
// which on the public catalog means a route lost its marker (H23). Other 4xx and 429 are answers
// to what the visitor asked, and a refused path comes from their input (H17).
function isReported(error: ApiError): boolean {
  switch (error.kind) {
    case 'network':
    case 'timeout':
    case 'schema':
      return true;
    case 'http':
      return error.status === 401 || (error.status ?? 0) >= 500;
    case 'path':
      return false;
  }
}

// The kind and the route, never the path: the ids in it would make one cause many issues. An
// `http` answer adds its status, so a 401 (a lost marker) is not held back by a 500 on the same
// route.
function fingerprintOf(error: unknown): string[] | undefined {
  if (error instanceof ApiError) {
    if (!isReported(error)) return undefined;
    const fingerprint = ['api-failure', error.kind, error.method ?? '', error.template];
    if (error.kind === 'http') fingerprint.push(String(error.status));
    return fingerprint;
  }
  // Not an api failure (H29): web's env refused, a bug in web.
  return ['web-failure', error instanceof Error ? error.name : typeof error];
}

function due(key: string): boolean {
  const now = Date.now();
  const last = lastSent.get(key);
  if (last !== undefined && now - last < WINDOW_MS) return false;
  lastSent.set(key, now);
  return true;
}

// Values only, no bodies or query values (as sentry.options.ts).
function tagsOf(error: unknown, context: ReportContext): Record<string, string> {
  const tags: Record<string, string> = {};
  if (error instanceof ApiError) {
    if (error.status !== undefined) tags.api_status = String(error.status);
    if (error.code !== undefined) tags.api_code = error.code;
  }
  if (context.requestId) tags.request_id = context.requestId;
  return tags;
}

// Called by the response step for every `ApiError` it throws; reports those that mean a bug or an
// outage, once per cause per minute.
export function reportApiError(error: ApiError, context: ReportContext = {}): void {
  report(error, context);
}

// For a component's catch: an `ApiError` was already reported where it was thrown, anything else
// (H29) is reported here.
export function reportFailure(error: unknown): void {
  if (!(error instanceof ApiError)) report(error, {});
}

function report(error: unknown, context: ReportContext): void {
  const fingerprint = fingerprintOf(error);
  if (!fingerprint || !due(fingerprint.join('\n'))) return;
  Sentry.captureException(error, { fingerprint, tags: tagsOf(error, context) });
}
