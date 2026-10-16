import { defineConfig } from 'vitest/config';

// No SWC plugin: Vite 8 (under Vitest 5) transpiles with Oxc, which emits decorator metadata from
// `emitDecoratorMetadata` in tsconfig.json, so Nest's dependency injection works in tests. Tests
// that build classes through Nest's DI (e.g. hello.controller.spec.ts) fail if that ever stops.
export default defineConfig({
  test: {
    environment: 'node',
    // Environment for tests that boot the whole app: valid values, but every dependency points at
    // a closed local port, so nothing real is touched. The one exception is the `database` project.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      WEB_ORIGIN: 'http://localhost:3001',
      APP_VERSION: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
      REDIS_URL: 'redis://127.0.0.1:1',
      TEMPORAL_ADDRESS: '127.0.0.1:1',
      // Five requests per route and tier, then 429. The 1-second windows are set out of reach, so a
      // slow run never splits a test's requests across two of them; test/throttling-tiers.e2e-spec.ts
      // lowers them where it checks them.
      THROTTLE_READ_BURST: '100',
      THROTTLE_READ_MINUTE: '5',
      THROTTLE_WRITE_BURST: '100',
      THROTTLE_WRITE_MINUTE: '5',
      THROTTLE_EXPENSIVE_BURST: '100',
      THROTTLE_EXPENSIVE_MINUTE: '5',
      ADMIN_API_TOKEN: 'test-admin-token-0123456789abcdef',
      PROXY_SECRET: 'testproxysecret0123456789abcdef0',
      MEDIA_BASE_URL: 'http://localhost:3001/media/',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      S3_BUCKET: 'test-bucket',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
          exclude: ['test/database/**'],
        },
      },
      // Specs under test/database/ (and only there) use a real, throwaway PostgreSQL, SeaweedFS and
      // Temporal: one Testcontainers container each per run, a database per file
      // (test/support/database.ts, spec 0002 C19/C20), one shared bucket (test/support/storage.ts,
      // spec 0011 M17) and a task queue per file (test/support/temporal.ts, M16). Their
      // globalSetup runs only when one of these files runs, and needs Docker.
      {
        extends: true,
        test: {
          name: 'database',
          include: ['test/database/**/*.e2e-spec.ts'],
          globalSetup: [
            'test/support/database.ts',
            'test/support/storage.ts',
            'test/support/temporal.ts',
          ],
        },
      },
    ],
  },
});
