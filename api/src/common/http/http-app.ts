import type { NestApplicationOptions } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { Env } from '../../config/env.js';
import { createValidationPipe } from '../validation/validation-pipe.js';
import { AppExpressAdapter } from './app-express.adapter.js';
import { useRequestContext } from './request-context.js';
import { TimeoutInterceptor } from './timeout.interceptor.js';

// Creates the app (NestFactory.create in server.ts, a testing module's createNestApplication in
// tests) with the adapter and options this function sets.
export type CreateApp = (
  adapter: AppExpressAdapter,
  options: NestApplicationOptions,
) => NestExpressApplication | Promise<NestExpressApplication>;

// The HTTP setup server.ts and every e2e app share, so a test runs the parsers, the request
// context, the pipe and the request timeout production runs. The app is not initialised: the caller adds what is its
// own (logger, socket adapter, Swagger) and calls init() or listen().
export async function createHttpApp(
  create: CreateApp,
  options: Omit<NestApplicationOptions, 'bodyParser'> = {},
): Promise<NestExpressApplication> {
  // The adapter keeps body-parser's errors apart. No default parsers: only the JSON one below is
  // registered, so form bodies are not read (spec 0006 F26).
  const app = await create(new AppExpressAdapter(), { ...options, bodyParser: false });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // X-Forwarded-For counts only on a request with the proxy secret (spec 0006 F13): the
  // request-context middleware reads it, so Express must not (req.ip stays the connection's).
  app.set('trust proxy', false);
  // Before init() and ahead of the body parser registered below: a refused body (BAD_JSON,
  // PAYLOAD_TOO_LARGE) still gets a request id.
  useRequestContext(app);
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });
  // After CORS, so a refused body still answers with the CORS headers the browser needs to read it.
  app.useBodyParser('json', { limit: config.get('BODY_LIMIT', { infer: true }) });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalInterceptors(
    new TimeoutInterceptor(config.get('REQUEST_TIMEOUT_MS', { infer: true })),
  );
  return app;
}
