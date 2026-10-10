import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SentryModule } from '@sentry/nestjs/setup';

import { AttributesModule } from './attributes/attributes.module.js';
import { BrandsModule } from './brands/brands.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { AppExceptionFilter } from './common/filters/app-exception.filter.js';
import { CoreModule } from './core/core.module.js';
import { HealthModule } from './health/health.module.js';
import { HelloModule } from './hello/hello.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RedisModule } from './redis/redis.module.js';
import { TemporalClientModule } from './temporal/temporal-client.module.js';
import { ThrottlingModule } from './throttling/throttling.module.js';

// The HTTP and WebSocket server (src/main.ts).
@Module({
  imports: [
    // Names request traces by route. Errors are reported by AppExceptionFilter (5xx only), so
    // Sentry's own SentryGlobalFilter is not used.
    SentryModule.forRoot(),
    CoreModule,
    // In-process domain events, e.g. a service announcing a change that the gateway pushes to
    // browsers.
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    TemporalClientModule,
    ThrottlingModule,
    RealtimeModule,
    HealthModule,
    HelloModule,
    CategoriesModule,
    BrandsModule,
    AttributesModule,
  ],
  // Every HTTP error answers one format with a code (spec 0004 E18–E22).
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
