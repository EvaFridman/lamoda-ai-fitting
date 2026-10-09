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
      THROTTLE_LIMIT: '5',
      ADMIN_API_TOKEN: 'test-admin-token-0123456789abcdef',
      MEDIA_BASE_URL: 'http://localhost:3001/media/',
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
      // Specs under test/database/ (and only there) use a real, throwaway PostgreSQL: one
      // Testcontainers container per run, a database per file (test/support/database.ts, spec
      // 0002 C19/C20). Its globalSetup runs only when one of these files runs, and needs Docker.
      {
        extends: true,
        test: {
          name: 'database',
          include: ['test/database/**/*.e2e-spec.ts'],
          globalSetup: ['test/support/database.ts'],
        },
      },
    ],
  },
});
