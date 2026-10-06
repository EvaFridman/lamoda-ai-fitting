import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module.js';

// Root module of the Temporal worker process (src/temporal/worker.ts). Modules whose services
// activities need (PrismaModule, RedisModule, ...) are added here as activities start using them.
@Module({
  imports: [CoreModule],
})
export class WorkerModule {}
