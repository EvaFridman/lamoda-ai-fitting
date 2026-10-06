import 'server-only';

import { z } from 'zod';

// Server-side environment of the web app, read at request time. Not validated on import: `next
// build` loads these modules while prerendering, when none of this exists (and must not be needed).
const serverEnvSchema = z.object({
  // Server-to-server address of the api, e.g. http://api:3000 (never the public URL).
  API_URL: z.url(),
  // redis://host:6379
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),
  // The deployed image tag (commit hash); `dev` locally.
  APP_VERSION: z.string().min(1).default('dev'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  cached = result.data;
  return cached;
}
