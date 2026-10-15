// Sentry 11 ships its build-time config helper from a separate entry point.
import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone: the Docker image copies it and runs `node server.js`
  // without node_modules.
  output: 'standalone',
  // The repository holds several lockfiles (root, api, web), so Next would have to guess the
  // project root. web/ is self-contained: pin it, so .next/standalone/server.js lands at the top of
  // the standalone folder instead of a nested web/ path.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  reactCompiler: true,
  // Cache Components: the build prerenders a static shell; uncached data (anything from the api)
  // renders per request inside <Suspense>. So the image builds with no api, Redis or database.
  cacheComponents: true,
  // Images under public/media/ keep their key when the file is replaced, so they are not immutable:
  // a day bounds how long a visitor sees an old one (spec 0002, C9e).
  async headers() {
    return [
      {
        source: '/media/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ];
  },
  // The browser calls the site's own /api (spec 0007 H6). In production nginx serves /api/ before
  // Next and strips the prefix; locally there is no nginx, so `next dev` forwards it the same way.
  // The production image has no rewrite: built without API_URL, it must not proxy anything.
  async rewrites() {
    const apiUrl = process.env.API_URL;
    if (process.env.NODE_ENV !== 'development' || !apiUrl) return [];
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

// Source maps are generated, uploaded to Sentry and deleted from the build only when an auth token
// is present (CI builds of main; the token enters the Docker build as a BuildKit secret). Without
// it (local builds, pull requests) none are generated: there is nowhere to upload them to.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // The commit hash, the same value the server reports as APP_VERSION.
  release: { name: process.env.SENTRY_RELEASE },
  sourcemaps: { disable: !uploadSourceMaps, deleteSourcemapsAfterUpload: true },
  telemetry: false,
  // Report the upload whenever there is one (inside the Docker build `CI` is not set, so keying on it
  // hid both success and failure); stay quiet when there is nothing to upload.
  silent: !uploadSourceMaps,
});
