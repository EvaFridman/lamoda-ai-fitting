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
