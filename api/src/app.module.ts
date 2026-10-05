import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { type Env, validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { HelloModule } from './hello/hello.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { TemporalClientModule } from './temporal/temporal-client.module.js';

@Module({
  imports: [
    // Configuration comes only from the process environment (compose sets it); no .env loading.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // Readable lines in development, JSON (for log collectors) everywhere else.
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          // Health checks are polled every few seconds; logging them would bury real requests.
          autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    TemporalClientModule,
    HealthModule,
    HelloModule,
  ],
})
export class AppModule {}
