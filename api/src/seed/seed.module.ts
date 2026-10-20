import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module.js';
import { PrismaService, UnlimitedPrismaService } from '../prisma/prisma.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { SeedService } from './seed.service.js';

// Root module of the seed process (src/seed/main.ts): configuration, logging, the database and the
// storage (the catalog's photos, spec 0011). The database client is the api's without its pool
// limits (spec 0014 plan §2.7).
@Module({
  imports: [CoreModule, StorageModule],
  providers: [SeedService, { provide: PrismaService, useClass: UnlimitedPrismaService }],
})
export class SeedModule {}
