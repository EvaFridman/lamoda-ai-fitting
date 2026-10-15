import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { AppExpressAdapter } from './common/http/app-express.adapter.js';
import { useRequestContext } from './common/http/request-context.js';
import { createValidationPipe } from './common/validation/validation-pipe.js';
import type { Env } from './config/env.js';
import { SocketIoAdapter } from './realtime/socket-io.adapter.js';
import { setupSwagger } from './swagger.js';

// The HTTP and WebSocket server, loaded by main.ts once Sentry has started.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new AppExpressAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // X-Forwarded-For counts only on a request with the proxy secret (spec 0006 F13): the
  // request-context middleware reads it, so Express must not (req.ip stays the connection's).
  app.set('trust proxy', false);
  // Before init() and before any useBodyParser(), so it runs ahead of the body parser: a refused
  // body (BAD_JSON, PAYLOAD_TOO_LARGE) still gets a request id.
  useRequestContext(app);
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  app.enableCors({ origin: webOrigin, credentials: true });
  app.useWebSocketAdapter(new SocketIoAdapter(app, webOrigin));
  app.useGlobalPipes(createValidationPipe());
  // On SIGTERM (container stop, blue-green switch) finish requests in flight before exiting.
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app, config.get('APP_VERSION', { infer: true }));
  }

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
