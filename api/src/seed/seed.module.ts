import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { SeedService } from './seed.service.js';

// Root module of the seed process (src/seed/main.ts): configuration, logging, the database and the
// storage (the catalog's photos, spec 0011).
@Module({
  imports: [CoreModule, PrismaModule, StorageModule],
  providers: [SeedService],
})
export class SeedModule {}
