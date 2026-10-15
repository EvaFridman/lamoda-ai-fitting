import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SentryModule } from '@sentry/nestjs/setup';

import { AiGenerationsModule } from './ai-generations/ai-generations.module.js';
import { AttributesModule } from './attributes/attributes.module.js';
import { BrandsModule } from './brands/brands.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { AccessGuard } from './common/auth/access.guard.js';
import { AppExceptionFilter } from './common/filters/app-exception.filter.js';
import { CoreModule } from './core/core.module.js';
import { FittingSessionsModule } from './fitting-sessions/fitting-sessions.module.js';
import { HealthModule } from './health/health.module.js';
import { HelloModule } from './hello/hello.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductsModule } from './products/products.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RedisModule } from './redis/redis.module.js';
import { TemporalClientModule } from './temporal/temporal-client.module.js';
import { TieredThrottlerGuard } from './throttling/tiered-throttler.guard.js';
import { ThrottlingModule } from './throttling/throttling.module.js';
import { UsersModule } from './users/users.module.js';

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
    ProductsModule,
    UsersModule,
    FittingSessionsModule,
    AiGenerationsModule,
  ],
  providers: [
    // Every HTTP error answers one format with a code (spec 0004 E18–E22).
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    // Global guards run in the order they are registered, so both are registered here. The rate
    // limit comes first: a request with a wrong admin token is counted before it is refused, so
    // guessing the token runs into the limit (spec 0006 F5). Then access, closed unless a route is
    // marked @Public() or @AdminOnly() (F3).
    { provide: APP_GUARD, useClass: TieredThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
