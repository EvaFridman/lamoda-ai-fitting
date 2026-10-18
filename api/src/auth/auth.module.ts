import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Auth, createAuth } from './auth.js';
import { sessionReader, type SharedSessionReader } from './session-reader.js';

// The Better Auth instance: createHttpApp() mounts its handler at /api/auth.
export const AUTH = Symbol('AUTH');
// The one session reader of the process, for the request context and the socket adapter: they
// share its cap on reads in progress (N29).
export const SESSION_READER = Symbol('SESSION_READER');

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
    {
      provide: SESSION_READER,
      inject: [AUTH],
      useFactory: (auth: Auth): SharedSessionReader => sessionReader(auth),
    },
  ],
  exports: [AUTH, SESSION_READER],
})
export class AuthModule {}
