import { defineConfig } from 'vitest/config';

// No SWC plugin: Vite 8 (under Vitest 5) transpiles with Oxc, which emits decorator metadata from
// `emitDecoratorMetadata` in tsconfig.json, so Nest's dependency injection works in tests. Tests
// that build classes through Nest's DI (e.g. hello.controller.spec.ts) fail if that ever stops.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    // Environment for tests that boot the whole app: valid values, but every dependency points at
    // a closed local port, so nothing real is touched.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      WEB_ORIGIN: 'http://localhost:3001',
      APP_VERSION: 'test',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
      REDIS_URL: 'redis://127.0.0.1:1',
      TEMPORAL_ADDRESS: '127.0.0.1:1',
    },
  },
});
