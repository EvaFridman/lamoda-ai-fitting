import { Module } from '@nestjs/common';

import { CoreModule } from '../core/core.module.js';
import { PrismaService, UnlimitedPrismaService } from '../prisma/prisma.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { LargeCatalogService } from './large-catalog.service.js';
import { SeedService } from './seed.service.js';

// Root module of the development catalog's process (src/seed/large-catalog.ts): the seed's, plus
// the service that adds the generated products. Without the pool limits, as the seed (spec 0014
// plan §2.7).
@Module({
  imports: [CoreModule, StorageModule],
  providers: [
    SeedService,
    LargeCatalogService,
    { provide: PrismaService, useClass: UnlimitedPrismaService },
  ],
})
export class LargeCatalogModule {}
