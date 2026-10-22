// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function revalidateAsked(): Promise<unknown> {
  vi.resetModules();
  vi.stubEnv('API_URL', 'http://api:3000');
  vi.stubEnv('SITE_URL', 'http://site');
  vi.stubEnv('REDIS_CACHE_URL', 'redis://redis-cache:6379');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true })))),
  );
  const { cacheLife } = await import('next/cache');
  const { cachedApiFetch } = await import('./cached-api-fetch');
  const { buildPath } = await import('./path');
  await cachedApiFetch(buildPath('/things'), z.object({ ok: z.boolean() }));
  return vi.mocked(cacheLife).mock.calls[0]?.[0];
}

describe('cachedApiFetch lifetime from the environment', () => {
  it('revalidates after 60 s by default', async () => {
    vi.stubEnv('PAGE_CACHE_REVALIDATE_SECONDS', undefined);
    expect(await revalidateAsked()).toEqual({ stale: 60, revalidate: 60, expire: 3600 });
  });

  it('takes PAGE_CACHE_REVALIDATE_SECONDS', async () => {
    vi.stubEnv('PAGE_CACHE_REVALIDATE_SECONDS', '120');
    expect(await revalidateAsked()).toEqual({ stale: 60, revalidate: 120, expire: 3600 });
  });
});
