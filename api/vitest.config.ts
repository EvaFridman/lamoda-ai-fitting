import { defineConfig } from 'vitest/config';

// No SWC plugin: Vite 8 (under Vitest 5) transpiles with Oxc, which emits decorator metadata from
// `emitDecoratorMetadata` in tsconfig.json, so Nest's dependency injection works in tests. Tests
// that build classes through Nest's DI (e.g. hello.controller.spec.ts) fail if that ever stops.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  },
});
