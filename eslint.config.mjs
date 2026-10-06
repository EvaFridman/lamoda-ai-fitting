// One ESLint config for the whole monorepo (A3): ESLint and every plugin are installed in the root
// only, so `api` and `web` cannot drift to different versions. Run from the root: `npm run lint`.
//
// The web block assembles its plugins by hand instead of importing eslint-config-next:
// - eslint-config-next loads its parser from the `next` package, which lives in web/node_modules
//   and is not resolvable from the root;
// - its React and a11y plugins (eslint-plugin-react, eslint-plugin-jsx-a11y) do not run on
//   ESLint 10, so their maintained replacements are used: @eslint-react/eslint-plugin and
//   eslint-plugin-jsx-a11y-x.

import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const webFiles = ['web/**/*.{ts,tsx,js,jsx,mjs}'];

// Hook rules come from the React team's eslint-plugin-react-hooks (it also carries the React
// Compiler rules). @eslint-react ships copies of several of them under the same names; they are
// turned off, so a problem is reported once. Computed, so new shared rules are covered too.
const eslintReactCopiesOfHookRules = Object.fromEntries(
  Object.keys(reactHooks.configs.recommended.rules)
    .map((name) => `@eslint-react/${name.replace('react-hooks/', '')}`)
    .filter((name) => name in eslintReact.configs['recommended-typescript'].rules)
    .map((name) => [name, 'off']),
);

const unusedVars = [
  'error',
  { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'api/src/generated/**',
      'web/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': unusedVars,
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Root tooling scripts and configs, and the agents' guard hooks, run in Node.
  {
    files: ['*.{js,mjs,cjs,ts}', 'scripts/**/*.{js,mjs}', '.claude/hooks/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // api: NestJS on Node.
  {
    files: ['api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // web: Next.js, React, hooks, accessibility.
  { ...eslintReact.configs['recommended-typescript'], files: webFiles },
  { ...jsxA11y.configs.recommended, files: webFiles },
  {
    files: webFiles,
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router only: there is no pages/ directory for this rule to check.
      '@next/next/no-html-link-for-pages': 'off',
      ...eslintReactCopiesOfHookRules,
    },
  },

  // Last: turns off every rule that would fight Prettier.
  prettier,
);
