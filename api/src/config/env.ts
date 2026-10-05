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
