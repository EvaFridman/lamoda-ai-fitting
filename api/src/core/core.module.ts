import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Options } from 'pino-http';

import { findRequestContext } from '../common/http/request-context.js';
import { type Env, validateEnv } from '../config/env.js';

// What every process of the api image needs: validated configuration and logging. Imported by
// AppModule (HTTP server), WorkerModule (Temporal worker) and SeedModule (seed).
@Module({
  imports: [
    // Configuration comes only from the process environment (compose sets it); no .env loading.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({ pinoHttp: pinoHttpOptions(config) }),
    }),
  ],
})
export class CoreModule {}

// Exported for the test that checks secrets are redacted from request logs.
export function pinoHttpOptions(config: ConfigService<Env, true>): Options {
  return {
    level: config.get('LOG_LEVEL', { infer: true }),
    // Readable lines in development, JSON (for log collectors) everywhere else.
    transport:
      config.get('NODE_ENV', { infer: true }) === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      // The admin token (spec 0004 E1) and the proxy secret (0006 F13); Node lower-cases names.
      'req.headers["x-admin-token"]',
      'req.headers["x-proxy-secret"]',
      'res.headers["set-cookie"]',
    ],
    // The id the request-context middleware chose (and answered in X-Request-Id); a new one in apps
    // without it, such as the worker's or a unit test's.
    genReqId: (req) => findRequestContext(req)?.requestId ?? randomUUID(),
    // Health checks are polled every few seconds; logging them would bury real requests.
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
  };
}
