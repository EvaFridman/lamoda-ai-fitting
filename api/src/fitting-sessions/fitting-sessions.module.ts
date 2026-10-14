import { Module } from '@nestjs/common';

import { FittingSessionsController } from './fitting-sessions.controller.js';
import { FittingSessionsService } from './fitting-sessions.service.js';

@Module({
  controllers: [FittingSessionsController],
  providers: [FittingSessionsService],
})
export class FittingSessionsModule {}
