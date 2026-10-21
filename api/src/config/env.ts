import { z } from 'zod';

// The proxy secret: empty, or long enough not to be guessed; letters and digits only, as nginx's
// config and the server's sourced .env would break on `$`, `"` or `;`.
const proxySecret = () =>
  z
    .union([
      z.literal(''),
      z.string().regex(/^[A-Za-z0-9]{32,}$/, 'must be at least 32 letters or digits'),
    ])
    .default('');

// An http(s) address, or empty when the feature is off.
const optionalUrl = () => z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).default('');

// Every environment variable the api reads. Validated once at startup: a missing or malformed
// value stops the process with the variable's name, instead of failing later at first use.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Browser origin allowed by CORS (the web app in development; same origin in production). Exactly
    // what a browser sends in Origin (scheme://host[:port], no path, trailing slash or default
    // port): CORS and the socket's Origin check compare it as a string, so any other form would
    // refuse every browser (N43).
    // zod 4 runs the refinement after a failed format check too, and new URL() throws on a non-URL.
    WEB_ORIGIN: z.url().refine((value) => URL.canParse(value) && new URL(value).origin === value, {
      message: 'must be an origin: scheme://host[:port], without a path or a trailing slash',
    }),
    // The deployed image tag (commit hash); `dev` locally.
    APP_VERSION: z.string().min(1).default('dev'),

    // postgresql://user:password@host:5432/db
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),
    // redis://host:6379 (a password, if any, goes into the URL)
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),
    // The caches' Redis (spec 0018 V4): the filter counts. Same form as REDIS_URL.
    REDIS_CACHE_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),
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
    // so a typo cannot let nginx's proxy timeout answer 504 first (F27). Keep it at 6000 or more: a
    // delete waits up to 5 s for its file deletion to start (START_TIMEOUT_MS) and must still
    // answer 204 with Temporal down (spec 0011 M26). Not enforced, so tests can set 100 ms (with the
    // database timeouts below lowered under it).
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
    // The api's database pool (spec 0014 plan §2.7): at most this many connections, so a few slow
    // requests cannot take every one Postgres has (O18).
    DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),
    // Milliseconds a statement may run before Postgres cancels it (57014), then 503 (O18).
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    // Milliseconds a query waits for a free connection, then 503 (O36).
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    // Largest socket.io message in bytes; a bigger one never reaches the gateway: it closes a
    // WebSocket and answers 413 on long-polling (spec 0006 F8). nginx does not limit WebSocket
    // frames; at most 1 MB (F30).
    SOCKET_MAX_MESSAGE_BYTES: z.coerce.number().int().positive().max(1_048_576).default(65_536),
    // Seconds the filter counts stay in Redis (spec 0014 plan §2.6); a catalog change shows within
    // it (O49). At most an hour (O57).
    FACETS_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),

    // Sent in the X-Proxy-Secret header by nginx and web (spec 0006 F13): only such a request names
    // the client's address (X-Forwarded-For) and the request id. Empty trusts no request.
    PROXY_SECRET: proxySecret(),
    // Trusted as well, set only while the proxy secret is rotated (spec 0006 F21): the running copy
    // already accepts the new value when a deploy recreates nginx with it and then fails. nginx and
    // web never send it.
    PROXY_SECRET_NEXT: proxySecret(),
    // Signs Better Auth's session cookies (spec 0013 plan §8): generated by scripts/init-env.sh
    // locally, required in production. Must differ from the proxy secrets. Letters and digits only,
    // like the proxy secret: the server's .env is sourced by the deploy (N21).
    BETTER_AUTH_SECRET: proxySecret(),
    // Google's OAuth client (sign-in, spec 0013 N2): empty locally, required in production.
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    // The fake OpenID provider that replaces Google locally and in tests (N14): the address the api
    // reaches it at (http://oidc:4010 in compose) and the browser's address of its login page
    // (http://localhost:4010). Set both or neither; production refuses them.
    AUTH_FAKE_OIDC_URL: optionalUrl(),
    AUTH_FAKE_OIDC_PUBLIC_URL: optionalUrl(),
    // Where image keys are served: http://localhost:3001/media/ locally (spec 0004 E8).
    MEDIA_BASE_URL: z.url({ protocol: /^https?$/ }),

    // S3 storage (spec 0011). Required in every environment, the worker's too: it deletes files
    // (M19). The api's and the worker's address of the storage: http://s3:8333 locally.
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
    // The host signed links carry, i.e. the browser's address of the storage (the signature covers
    // it): http://localhost:8333 locally. Empty: S3_ENDPOINT.
    S3_PUBLIC_ENDPOINT: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).default(''),
    S3_REGION: z.string().min(1).default('ru-1'),
    // The app's bucket (M1).
    S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'must be an S3 bucket name'),
    // The key of a user that reads and writes the app's bucket only (M10, M14). Any non-space
    // characters: the provider's key format is not ours (M19).
    S3_ACCESS_KEY_ID: z.string().regex(/^\S+$/, 'must be set, with no spaces'),
    S3_SECRET_ACCESS_KEY: z.string().regex(/^\S+$/, 'must be set, with no spaces'),
    // How long a signed link to a private file works (M9).
    S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

    // OpenAI (spec 0019 A4): the one key of the image model, the vision model and the moderation
    // endpoint, for the api (the checks) and the worker (the generation). Empty selects the fake
    // provider (locally, in tests and CI, which never reach OpenAI, AC27); production refuses to
    // start without it (assertServerEnv, assertWorkerEnv). No spaces: it goes into the sourced
    // .env.
    OPENAI_API_KEY: z.string().regex(/^\S*$/, 'must have no spaces').default(''),
    // The image model of the edits endpoint (A17; `gpt-image-2.5-sunburst` is the alternative) and
    // the small vision model of the photo and text checks (A15).
    FITTING_MODEL: z
      .string()
      .regex(/^[\w.-]+$/, 'must be a model name')
      .default('gpt-image-2'),
    FITTING_VISION_MODEL: z
      .string()
      .regex(/^[\w.-]+$/, 'must be a model name')
      .default('gpt-6-luna'),
    // Try-ons per user and calendar month (A5).
    FITTING_MONTHLY_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
    // Seconds one generation may take at the model (A28); the spec's assumption is three minutes.
    FITTING_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(600).default(180),
    // Milliseconds a check inside a request (the photo check, the text check) may take, its two
    // calls in parallel, then 503 with nothing stored (A45). At most half of REQUEST_TIMEOUT_MS,
    // checked by assertServerEnv at the server's start: sharp and the bucket write keep the other
    // half.
    FITTING_CHECK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(10_000).default(4000),
    // Largest photo a user may upload in bytes (A31); nginx's limit of the upload route moves with
    // it. At most 50 MB.
    FITTING_PHOTO_MAX_BYTES: z.coerce.number().int().positive().max(52_428_800).default(20_971_520),

    // Sentry (spec 0004 E23): the api's own project, empty turns it off. Read by instrument.ts before
    // Nest starts; validated here so a malformed DSN stops the process with its name.
    SENTRY_DSN: optionalUrl(),
    // Defaults to NODE_ENV.
    SENTRY_ENVIRONMENT: z.string().default(''),
  })
  // web and nginx get the proxy secret: an equal auth secret would let a leak there forge sessions.
  // The message names the variables, never the values.
  .refine(
    (env) =>
      env.BETTER_AUTH_SECRET === '' ||
      (env.BETTER_AUTH_SECRET !== env.PROXY_SECRET &&
        env.BETTER_AUTH_SECRET !== env.PROXY_SECRET_NEXT),
    {
      path: ['BETTER_AUTH_SECRET'],
      message: 'must differ from PROXY_SECRET and PROXY_SECRET_NEXT',
    },
  )
  // One without the other would send the browser to one provider and the api to another, or none.
  .refine((env) => (env.AUTH_FAKE_OIDC_URL === '') === (env.AUTH_FAKE_OIDC_PUBLIC_URL === ''), {
    path: ['AUTH_FAKE_OIDC_PUBLIC_URL'],
    message: 'must be set together with AUTH_FAKE_OIDC_URL',
  })
  // A query may wait for a connection and then run its statement: one query answers 503 before the
  // request timeout does (O59). A transaction gets the same two as maxWait and timeout, but Prisma
  // does not stop a statement under way, so its last one may run on to its statement timeout; a
  // handler that runs several in a row is bounded only by the request timeout.
  .refine(
    (env) =>
      env.DATABASE_CONNECTION_TIMEOUT_MS + env.DATABASE_STATEMENT_TIMEOUT_MS <
      env.REQUEST_TIMEOUT_MS,
    {
      path: ['DATABASE_STATEMENT_TIMEOUT_MS'],
      message:
        'DATABASE_CONNECTION_TIMEOUT_MS + DATABASE_STATEMENT_TIMEOUT_MS must be less than REQUEST_TIMEOUT_MS',
    },
  );

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
// Without the proxy secret production would count every visitor as nginx's or web's address;
// without the auth secret and Google's client nobody could sign in, and the fake provider would let
// anyone sign in as anyone (spec 0013 AC14); without the OpenAI key no check and no generation
// could run (spec 0019 AC27). Every problem is named at once; never a value.
export type ServerEnv = Pick<
  Env,
  | 'NODE_ENV'
  | 'PROXY_SECRET'
  | 'BETTER_AUTH_SECRET'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'AUTH_FAKE_OIDC_URL'
  | 'AUTH_FAKE_OIDC_PUBLIC_URL'
  | 'OPENAI_API_KEY'
  | 'REQUEST_TIMEOUT_MS'
  | 'FITTING_CHECK_TIMEOUT_MS'
>;

// What the worker process needs on top of the schema (spec 0019 plan §3): it runs the generation
// and the result's moderation, so production refuses an empty key there too.
export type WorkerEnv = Pick<Env, 'NODE_ENV' | 'OPENAI_API_KEY'>;

export function assertServerEnv(env: ServerEnv): void {
  const problems: string[] = [];
  // In every environment (A45): a check inside a request must leave the handler at least as much
  // time for sharp and the bucket write as it takes itself.
  if (env.FITTING_CHECK_TIMEOUT_MS * 2 > env.REQUEST_TIMEOUT_MS) {
    problems.push('FITTING_CHECK_TIMEOUT_MS: must be at most half of REQUEST_TIMEOUT_MS');
  }
  if (env.NODE_ENV === 'production') {
    const required = [
      'PROXY_SECRET',
      'BETTER_AUTH_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'OPENAI_API_KEY',
    ] as const;
    const forbidden = ['AUTH_FAKE_OIDC_URL', 'AUTH_FAKE_OIDC_PUBLIC_URL'] as const;
    problems.push(
      ...required
        .filter((name) => env[name] === '')
        .map((name) => `${name}: must be set in production`),
      ...forbidden
        .filter((name) => env[name] !== '')
        .map((name) => `${name}: must be empty in production`),
    );
  }
  if (problems.length > 0) throw new Error(`Invalid environment: ${problems.join('; ')}`);
}

export function assertWorkerEnv(env: WorkerEnv): void {
  if (env.NODE_ENV !== 'production' || env.OPENAI_API_KEY !== '') return;
  throw new Error('Invalid environment: OPENAI_API_KEY: must be set in production');
}

// What the server logs as a warning at start outside production, where assertServerEnv lets it
// pass: with no auth secret Better Auth signs cookies with its own default one, which anyone can
// read in its source (spec 0013 PR 2 review); with no OpenAI key the fake provider answers every
// check and generation (spec 0019 plan §3).
export function serverEnvWarnings(env: ServerEnv): string[] {
  if (env.NODE_ENV === 'production') return [];
  const warnings: string[] = [];
  if (env.BETTER_AUTH_SECRET === '') {
    warnings.push(
      "BETTER_AUTH_SECRET is empty: session cookies are signed with Better Auth's public default " +
        'secret; run scripts/init-env.sh to set one',
    );
  }
  return [...warnings, ...workerEnvWarnings(env)];
}

// The same for the worker: the one warning about the fake provider.
export function workerEnvWarnings(env: WorkerEnv): string[] {
  if (env.NODE_ENV === 'production' || env.OPENAI_API_KEY !== '') return [];
  return [
    'OPENAI_API_KEY is empty: the fake AI provider answers the photo and text checks and the ' +
      'generations; nothing reaches OpenAI',
  ];
}
