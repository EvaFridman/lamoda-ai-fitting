import * as Sentry from '@sentry/nestjs';

import { sentryOptions } from './sentry.options.js';

// Sentry for the api and the Temporal worker (spec 0004 E23–E25). Imported by the entry points
// (main.ts, temporal/worker.ts) before anything else. An empty SENTRY_DSN turns it off
// (development, CI, tests).
Sentry.init(sentryOptions(process.env));
