import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, type HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

import type { Env } from '../config/env.js';
import { DependencyChecks } from './dependency-checks.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly checks: DependencyChecks,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Is the process alive? No dependency checks: a database outage is not a reason to restart it.
  // `version` is the deployed image tag, so a deploy can confirm what is running.
  @Get('live')
  live(): { status: 'ok'; version: string } {
    return { status: 'ok', version: this.config.get('APP_VERSION', { infer: true }) };
  }

  // Can it serve requests? 200 when every dependency answers, 503 naming the ones that do not.
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.checks.postgres(),
      () => this.checks.redis(),
      () => this.checks.temporal(),
    ]);
  }
}
