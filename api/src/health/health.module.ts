import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DependencyChecks } from './dependency-checks.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DependencyChecks],
})
export class HealthModule {}
