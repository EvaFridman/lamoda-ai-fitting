import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';

import { CoreModule } from '../core/core.module.js';
import { StorageModule } from '../storage/storage.module.js';

// Root module of the Temporal worker process (src/temporal/worker.ts). Modules whose services
// activities need (PrismaModule, RedisModule, ...) are added here as activities start using them;
// StorageModule deletes users' files (spec 0011).
@Module({
  // Sentry starts in instrument.ts; failed activities are reported by sentryActivityInterceptor.
  imports: [SentryModule.forRoot(), CoreModule, StorageModule],
})
export class WorkerModule {}
