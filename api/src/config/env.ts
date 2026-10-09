import { z } from 'zod';

// Every environment variable the api reads. Validated once at startup: a missing or malformed
// value stops the process with the variable's name, instead of failing later at first use.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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

  // At most THROTTLE_LIMIT requests per client IP within THROTTLE_TTL_MS; then 429.
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),

  // Sent in the X-Admin-Token header by writes and by requests to users, fitting sessions and
  // generations (spec 0004 E1). Empty closes those requests entirely; a set one must be long
  // enough not to be guessed (E31).
  ADMIN_API_TOKEN: z
    .union([
      z.literal(''),
      z.string().regex(/^\S{32,}$/, 'must be at least 32 non-space characters'),
    ])
    .default(''),
  // Where image keys are served: http://localhost:3001/media/ locally (spec 0004 E8).
  MEDIA_BASE_URL: z.url({ protocol: /^https?$/ }),
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
