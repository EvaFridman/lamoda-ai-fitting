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
};

export default nextConfig;
