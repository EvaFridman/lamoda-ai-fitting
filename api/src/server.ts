import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { createHttpApp } from './common/http/http-app.js';
import { setServerTimeouts } from './common/http/server-timeouts.js';
import { assertServerEnv, type Env } from './config/env.js';
import { SocketIoAdapter } from './realtime/socket-io.adapter.js';
import { setupSwagger } from './swagger.js';

// The HTTP and WebSocket server, loaded by main.ts once Sentry has started.
async function bootstrap(): Promise<void> {
  const app = await createHttpApp(
    (adapter, options) => NestFactory.create<NestExpressApplication>(AppModule, adapter, options),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  assertServerEnv({
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    PROXY_SECRET: config.get('PROXY_SECRET', { infer: true }),
  });

  app.useWebSocketAdapter(
    new SocketIoAdapter(
      app,
      config.get('WEB_ORIGIN', { infer: true }),
      config.get('SOCKET_MAX_MESSAGE_BYTES', { infer: true }),
    ),
  );
  // On SIGTERM (container stop, blue-green switch) finish requests in flight before exiting.
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app, config.get('APP_VERSION', { infer: true }));
  }

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
  setServerTimeouts(app.getHttpServer());
}

void bootstrap();
