import 'server-only';

import type { MetadataRoute } from 'next';
import { connection } from 'next/server';

import { getServerEnv } from '@/shared/config/server';

// `/robots.txt`. Crawlers may read everything but the account (spec 0017 U12, AC3), the kit's page
// and the health check; batch addresses (`?cursor=`) stay open, their pages say `noindex, follow`
// (spec 0014 O26, O41). Built per request: the sitemap's address comes from `SITE_URL` (O67).
export async function catalogRobots(): Promise<MetadataRoute.Robots> {
  await connection();
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/customer', '/ui-kit', '/healthz'] },
    sitemap: new URL('/sitemap.xml', getServerEnv().SITE_URL).href,
  };
}
