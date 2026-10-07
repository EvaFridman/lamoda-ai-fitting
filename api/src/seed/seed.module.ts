import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SeedService } from './seed.service.js';

// Root module of the seed process (src/seed/main.ts): configuration, logging and the database only.
@Module({
  imports: [CoreModule, PrismaModule],
  providers: [SeedService],
})
export class SeedModule {}
