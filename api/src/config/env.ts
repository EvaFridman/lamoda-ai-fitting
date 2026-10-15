import { z } from 'zod';

// A shared secret: empty, or long enough not to be guessed.
const secret = () =>
  z
    .union([
      z.literal(''),
      z.string().regex(/^\S{32,}$/, 'must be at least 32 non-space characters'),
    ])
    .default('');

// The proxy secret: as above, but letters and digits only, as nginx's config and the server's
// sourced .env would break on `$`, `"` or `;`.
const proxySecret = () =>
  z
    .union([
      z.literal(''),
      z.string().regex(/^[A-Za-z0-9]{32,}$/, 'must be at least 32 letters or digits'),
    ])
    .default('');

// Every environment variable the api reads. Validated once at startup: a missing or malformed
// value stops the process with the variable's name, instead of failing later at first use.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Browser origin allowed by CORS (the web app in development; same origin in production).
    WEB_ORIGIN: z.url(),
    // The deployed image tag (commit hash); `dev` locally.
    APP_VERSION: z.string().min(1).default('dev'),

    // postgresql://user:password@host:5432/db
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),
    // redis://host:6379 (a password, if any, goes into the URL)
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),
    // host:port of the Temporal frontend, e.g. temporal:7233
    TEMPORAL_ADDRESS: z.string().regex(/^[\w.-]+:\d+$/, 'must be host:port'),
    TEMPORAL_NAMESPACE: z.string().min(1).default('default'),
    // Queue shared by the api (starts workflows) and the temporal-worker (runs them).
    TEMPORAL_TASK_QUEUE: z.string().min(1).default('main'),

    // Requests per client address and route within 1 s (BURST) and 60 s (MINUTE), then 429; one
    // pair per quota tier (spec 0006 F6): read (GET, HEAD), write (the other methods) and expensive
    // (routes marked @Expensive()).
    THROTTLE_READ_BURST: z.coerce.number().int().positive().default(10),
    THROTTLE_READ_MINUTE: z.coerce.number().int().positive().default(300),
    THROTTLE_WRITE_BURST: z.coerce.number().int().positive().default(3),
    THROTTLE_WRITE_MINUTE: z.coerce.number().int().positive().default(60),
    THROTTLE_EXPENSIVE_BURST: z.coerce.number().int().positive().default(1),
    THROTTLE_EXPENSIVE_MINUTE: z.coerce.number().int().positive().default(10),
    // Largest JSON body in bytes, then 413 PAYLOAD_TOO_LARGE (spec 0006 F12). nginx has a limit of
    // its own (client_max_body_size); at most 1 MB, so a typo cannot lift the api's (F24).
    BODY_LIMIT: z.coerce.number().int().positive().max(1_048_576).default(102_400),
    // Milliseconds a handler may take, then 503 SERVICE_UNAVAILABLE (spec 0006 F11); at most 30 s,
    // so a typo cannot let nginx's proxy timeout answer 504 first (F27).
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
    // Largest socket.io message in bytes; a bigger one never reaches the gateway: it closes a
    // WebSocket and answers 413 on long-polling (spec 0006 F8). nginx does not limit WebSocket
    // frames; at most 1 MB (F30).
    SOCKET_MAX_MESSAGE_BYTES: z.coerce.number().int().positive().max(1_048_576).default(65_536),

    // Sent in the X-Admin-Token header by writes and by requests to users, fitting sessions and
    // generations (spec 0004 E1). Empty closes those requests entirely; a set one must be long
    // enough not to be guessed (E31).
    ADMIN_API_TOKEN: secret(),
    // Sent in the X-Proxy-Secret header by nginx and web (spec 0006 F13): only such a request names
    // the client's address (X-Forwarded-For) and the request id. Empty trusts no request.
    PROXY_SECRET: proxySecret(),
    // Trusted as well, set only while the proxy secret is rotated (spec 0006 F21): the running copy
    // already accepts the new value when a deploy recreates nginx with it and then fails. nginx and
    // web never send it.
    PROXY_SECRET_NEXT: proxySecret(),
    // Where image keys are served: http://localhost:3001/media/ locally (spec 0004 E8).
    MEDIA_BASE_URL: z.url({ protocol: /^https?$/ }),

    // Sentry (spec 0004 E23): the api's own project, empty turns it off. Read by instrument.ts before
    // Nest starts; validated here so a malformed DSN stops the process with its name.
    SENTRY_DSN: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).default(''),
    // Defaults to NODE_ENV.
    SENTRY_ENVIRONMENT: z.string().default(''),
  })
  // web gets the proxy secret but not the admin token: equal values would let a leak from web open
  // the admin routes (spec 0006 F19). The message names the variables, never the values.
  .refine((env) => env.PROXY_SECRET === '' || env.PROXY_SECRET !== env.ADMIN_API_TOKEN, {
    path: ['PROXY_SECRET'],
    message: 'must differ from ADMIN_API_TOKEN',
  })
  .refine((env) => env.PROXY_SECRET_NEXT === '' || env.PROXY_SECRET_NEXT !== env.ADMIN_API_TOKEN, {
    path: ['PROXY_SECRET_NEXT'],
    message: 'must differ from ADMIN_API_TOKEN',
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}

// What the HTTP server needs on top of the schema, checked by server.ts at start. Not in the schema:
// the temporal-worker validates it too and neither sends nor receives requests (spec 0006 F18).
// Without the proxy secret production would count every visitor as nginx's or web's address.
export function assertServerEnv(env: Pick<Env, 'NODE_ENV' | 'PROXY_SECRET'>): void {
  if (env.NODE_ENV === 'production' && env.PROXY_SECRET === '') {
    throw new Error('Invalid environment: PROXY_SECRET: must be set in production');
  }
}
