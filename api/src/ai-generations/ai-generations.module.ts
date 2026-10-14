import { Module } from '@nestjs/common';

import { AiGenerationsController } from './ai-generations.controller.js';
import { AiGenerationsService } from './ai-generations.service.js';

@Module({
  controllers: [AiGenerationsController],
  providers: [AiGenerationsService],
})
export class AiGenerationsModule {}
