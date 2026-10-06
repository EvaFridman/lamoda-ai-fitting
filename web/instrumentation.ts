import * as Sentry from '@sentry/nextjs';

import { dataCollection } from './sentry.options';

// Server-side Sentry, configured at request-serving time from the container's environment. An
// empty SENTRY_DSN turns it off (development, CI).
export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN || undefined,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    release: process.env.APP_VERSION,
    tracesSampleRate: 0.1,
    dataCollection,
  });
}

// Errors thrown while rendering server components and route handlers.
export const onRequestError = Sentry.captureRequestError;
