import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';

import { AiModule } from '../ai/ai.module.js';
import { CoreModule } from '../core/core.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CountersRedisModule } from '../redis/redis.module.js';
import { StorageModule } from '../storage/storage.module.js';

// Root module of the Temporal worker process (src/temporal/worker.ts). Modules whose services
// activities need are added here as activities start using them; StorageModule deletes users'
// files (spec 0011), PrismaModule expired sign-in rows (spec 0013), AiModule the generation and
// the result's moderation, CountersRedisModule the push of a finished fitting (spec 0019, A44).
@Module({
  // Sentry starts in instrument.ts; failed activities are reported by sentryActivityInterceptor.
  imports: [
    SentryModule.forRoot(),
    CoreModule,
    StorageModule,
    PrismaModule,
    AiModule,
    CountersRedisModule,
  ],
})
export class WorkerModule {}
