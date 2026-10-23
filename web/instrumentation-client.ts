import * as Sentry from '@sentry/nextjs';

import {
  beforeBreadcrumb,
  beforeSend,
  beforeSendTransaction,
  dataCollection,
} from './sentry.options';

// Browser-side Sentry. NEXT_PUBLIC_* values are inlined into the bundle at build time (one image per
// environment); an empty DSN turns it off. The release name is injected by withSentryConfig.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production',
  tracesSampleRate: 0.1,
  dataCollection,
  beforeSend,
  // No signed link of a user's photo in a span or a breadcrumb (spec 0019 A37).
  beforeSendTransaction,
  beforeBreadcrumb,
});

// Page navigations as traces.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
