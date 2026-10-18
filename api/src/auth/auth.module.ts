import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Auth, createAuth } from './auth.js';

// The Better Auth instance: createHttpApp() mounts its handler at /api/auth.
export const AUTH = Symbol('AUTH');

@Module({
  providers: [
    {
      provide: AUTH,
      inject: [ConfigService, PrismaService, PinoLogger],
      useFactory: (
        config: ConfigService<Env, true>,
        prisma: PrismaService,
        logger: PinoLogger,
      ): Auth => {
        logger.setContext('BetterAuth');
        return createAuth(
          {
            WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
            BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
            GOOGLE_CLIENT_ID: config.get('GOOGLE_CLIENT_ID', { infer: true }),
            GOOGLE_CLIENT_SECRET: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
            AUTH_FAKE_OIDC_URL: config.get('AUTH_FAKE_OIDC_URL', { infer: true }),
            AUTH_FAKE_OIDC_PUBLIC_URL: config.get('AUTH_FAKE_OIDC_PUBLIC_URL', { infer: true }),
          },
          prisma,
          logger,
        );
      },
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
