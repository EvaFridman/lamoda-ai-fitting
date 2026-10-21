import type { MetadataRoute } from 'next';

// Crawlers may read everything but the account (spec 0017 U12, AC3). Spec 0014 adds its own
// lines here (`/ui-kit`, `/healthz`, the sitemap).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/customer' },
  };
}
