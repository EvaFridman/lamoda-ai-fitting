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
      // The proxy secret (spec 0006 F13); Node lower-cases names.
      'req.headers["x-proxy-secret"]',
      'res.headers["set-cookie"]',
    ],
    // Only the headers in LOGGED_HEADERS (spec 0021 Q9); the redaction above stays for a later
    // serializer change, and for the answer's Set-Cookie.
    serializers: { req: serializeRequest },
    // The id the request-context middleware chose (and answered in X-Request-Id); a new one in apps
    // without it, such as the worker's or a unit test's.
    genReqId: (req) => findRequestContext(req)?.requestId ?? randomUUID(),
    // Health checks are polled every few seconds; logging them would bury real requests.
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
  };
}

// The request headers a log line keeps (spec 0021 Q9, AC1): enough to tell a client and a body
// apart, nothing that identifies or authenticates a visitor. Node lower-cases header names.
export const LOGGED_HEADERS = ['user-agent', 'content-type', 'content-length', 'referer'] as const;

// A kept header's value is cut to this many characters, then `…` (spec 0021 Q16).
export const LOGGED_HEADER_MAX_LENGTH = 512;

// pino-http's serialized request (id, method, url, query, params, headers, remoteAddress,
// remotePort) with its headers cut to LOGGED_HEADERS. The referer is the browser's page address,
// which may carry anything in its query or fragment, so it keeps neither (Q16). Also used by
// /api/auth's request line.
export function serializeRequest(
  req: { headers?: Record<string, unknown> } & Record<string, unknown>,
): Record<string, unknown> {
  const headers: Record<string, unknown> = {};
  for (const name of LOGGED_HEADERS) {
    const value = req.headers?.[name];
    if (value === undefined) continue;
    const text = name === 'referer' ? String(value).replace(/[?#].*$/s, '') : String(value);
    headers[name] =
      text.length > LOGGED_HEADER_MAX_LENGTH ? `${text.slice(0, LOGGED_HEADER_MAX_LENGTH)}…` : text;
  }
  return { ...req, headers };
}
