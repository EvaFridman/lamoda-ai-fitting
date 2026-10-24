import { Module } from '@nestjs/common';

import { FittingNotifier } from './fitting-notifier.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Module({
  providers: [RealtimeGateway, FittingNotifier],
})
export class RealtimeModule {}
