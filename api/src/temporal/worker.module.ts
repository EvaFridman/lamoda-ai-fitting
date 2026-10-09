import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';

import { CoreModule } from '../core/core.module.js';

// Root module of the Temporal worker process (src/temporal/worker.ts). Modules whose services
// activities need (PrismaModule, RedisModule, ...) are added here as activities start using them.
@Module({
  // Sentry starts in instrument.ts; failed activities are reported by sentryActivityInterceptor.
  imports: [SentryModule.forRoot(), CoreModule],
})
export class WorkerModule {}
