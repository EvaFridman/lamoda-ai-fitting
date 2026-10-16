import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { AiGenerationsController } from './ai-generations.controller.js';
import { AiGenerationsService } from './ai-generations.service.js';

@Module({
  imports: [StorageModule],
  controllers: [AiGenerationsController],
  providers: [AiGenerationsService],
})
export class AiGenerationsModule {}
