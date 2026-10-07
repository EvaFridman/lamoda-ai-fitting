import { defineConfig } from 'vitest/config';

// No @vitejs/plugin-react: Vitest 5 compiles TSX itself with `jsx: react-jsx` from tsconfig.json,
// and Vite 8 resolves the `@/` alias from its `paths` (spec 0003, plan "Versions").
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    // CSS modules are compiled and keep their class names (`.button` stays `button`), so a test
    // can check which variant class a component got.
    css: {
      include: /\.module\.scss$/,
      modules: { classNameStrategy: 'non-scoped' },
    },
  },
});
