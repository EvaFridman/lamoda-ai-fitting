import type { BrowserOptions } from '@sentry/nextjs';

// Shared by the server (instrumentation.ts) and the browser (instrumentation-client.ts). Sentry 11
// collects user info, cookies, headers, query parameters and request/response bodies by default;
// error reports from this site carry none of them. Change a field only with a reason in the commit.
export const dataCollection: NonNullable<BrowserOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
};

// An api failure reaches Sentry only through src/shared/api/report.ts, which sets its fingerprint
// (with `api-failure`) and sends one event per cause per minute (spec 0007 plan §3). The same error
// reaching onRequestError or global-error, from a page that did not catch it, is dropped here: a
// down api would be an event per page view, and a 404 an event at all. By name, not instanceof: the
// instrumentation bundle may hold its own copy of the class.
export const beforeSend: NonNullable<BrowserOptions['beforeSend']> = (event, hint) => {
  const error = hint.originalException;
  const apiError = error instanceof Error && error.name === 'ApiError';
  // `includes`, not the first entry: a fingerprint set on a scope would come before report.ts's.
  return apiError && !event.fingerprint?.includes('api-failure') ? null : event;
};
