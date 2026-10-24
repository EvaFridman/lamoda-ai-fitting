import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { MeModule } from '../me/me.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FittingQuotaController } from './fitting-quota.controller.js';
import { FittingQuotaService } from './fitting-quota.service.js';
import { FittingsController } from './fittings.controller.js';
import { FittingsService } from './fittings.service.js';
import { ProductFittingsController } from './product-fittings.controller.js';

// The try-ons (spec 0019 plan §5): the text check through AiModule, the results' links through
// StorageModule, the workflow and the file deletions through the global TemporalClientModule, and
// MeService's cookies for a gone user's sign-out.
@Module({
  imports: [AiModule, StorageModule, MeModule],
  controllers: [FittingsController, FittingQuotaController, ProductFittingsController],
  providers: [FittingsService, FittingQuotaService],
})
export class FittingsModule {}
