import 'server-only';

import { z } from 'zod';

// Server-side environment of the web app, read at request time. Not validated on import: `next
// build` loads these modules while prerendering, when none of this exists (and must not be needed).
const serverEnvSchema = z
  .object({
    // Set by the image (and by Next itself) to production; only read for the check below.
    NODE_ENV: z.string().optional(),
    // Server-to-server address of the api, e.g. http://api:3000 (never the public URL).
    API_URL: z.url({ protocol: /^https?$/ }),
    // The site's public address, e.g. https://lamoda-ai-fitting.ru: the base of absolute links in
    // metadata (`metadataBase`, spec 0014 O67).
    SITE_URL: z.url({ protocol: /^https?$/ }),
    // The caches' Redis, redis://redis-cache:6379 (spec 0018 V4). The page cache's handler
    // (`cache-handlers/redis.mjs`) reads it itself, outside the bundle; checked here too, so a
    // malformed value fails the api reads as a wrong API_URL does, not only a cache that never
    // works. A Redis that is down is no error here (V5).
    REDIS_CACHE_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),
    // How long a cached catalog read stays fresh, in seconds (spec 0018 V3): after it the next
    // request gets the entry and refreshes it in the background.
    PAGE_CACHE_REVALIDATE_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
    // The deployed image tag (commit hash); `dev` locally.
    APP_VERSION: z.string().min(1).default('dev'),
    // Sent to the api as X-Proxy-Secret, so it takes the visitor's address and the request id from
    // apiFetch's headers. Server-only: never under NEXT_PUBLIC_. Empty sends nothing (the api then
    // counts every visitor as the web container); a set one needs at least 32 letters or digits, as
    // in api.
    PROXY_SECRET: z
      .string()
      .regex(/^([A-Za-z0-9]{32,})?$/, 'must be empty or at least 32 letters or digits')
      .default(''),
  })
  // A backstop to app.yml's `${PROXY_SECRET:?…}` (spec 0006 F20): env is read at request time, so
  // a production web without the secret fails every api call instead of quietly sharing one quota
  // among all visitors.
  .refine((env) => env.NODE_ENV !== 'production' || env.PROXY_SECRET !== '', {
    path: ['PROXY_SECRET'],
    message: 'must be set in production',
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
