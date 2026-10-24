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

// A user's photo is a signed storage link: its query carries `X-Amz-Credential` (the storage key's
// id) and its path the user's id under `keep/users/` (spec 0011 M34, spec 0019 A37). The browser's
// tracing names a span after each image it loads, with the whole link of another origin, so such
// spans and breadcrumbs are dropped, whatever field holds the link. So are the live connection's
// long-polling requests (spec 0019 plan §6): their `sid` is the socket's session, which reads its
// user's pushes without the cookie while it lasts, whether the field holds the whole link or only
// its query (`EIO=4&transport=polling&sid=…`).
const SIGNED_LINK = /X-Amz-|\/keep\/users\/|\/socket\.io\/?\?[^#]*\bsid=|\bEIO=\d[^#]*\bsid=/i;

function holdsSignedLink(values: readonly unknown[]): boolean {
  return values.some((value) => typeof value === 'string' && SIGNED_LINK.test(value));
}

export const beforeSendTransaction: NonNullable<BrowserOptions['beforeSendTransaction']> = (
  event,
) => {
  if (event.spans) {
    event.spans = event.spans.filter(
      (span) => !holdsSignedLink([span.description, ...Object.values(span.data)]),
    );
  }
  // The page load's own span keeps its attributes here, `lcp.url` among them: a photo that is the
  // largest paint names its link. Those keys go, the transaction stays.
  const rootData = event.contexts?.trace?.data;
  if (rootData) {
    for (const [key, value] of Object.entries(rootData)) {
      if (holdsSignedLink([value])) delete rootData[key];
    }
  }
  return event;
};

export const beforeBreadcrumb: NonNullable<BrowserOptions['beforeBreadcrumb']> = (breadcrumb) =>
  holdsSignedLink([breadcrumb.message, ...Object.values(breadcrumb.data ?? {})])
    ? null
    : breadcrumb;
