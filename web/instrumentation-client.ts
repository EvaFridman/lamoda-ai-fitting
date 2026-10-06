import * as Sentry from '@sentry/nextjs';

import { dataCollection } from './sentry.options';

// Browser-side Sentry. NEXT_PUBLIC_* values are inlined into the bundle at build time (one image per
// environment); an empty DSN turns it off. The release name is injected by withSentryConfig.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'production',
  tracesSampleRate: 0.1,
  dataCollection,
});

// Page navigations as traces.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
