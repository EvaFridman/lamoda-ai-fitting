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
  // The contract check reads the api's OpenAPI snapshot from disk: tests only (spec 0007 H18).
  {
    files: webFiles,
    ignores: ['web/**/*.test.{ts,tsx}', 'web/src/shared/contract/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Relative paths too: the group matches the import string, not the resolved file.
              group: [
                '@/shared/contract',
                '@/shared/contract/**',
                '**/shared/contract',
                '**/shared/contract/**',
                '../contract',
                '../contract/**',
              ],
              message: 'The contract check is test-only: import it from *.test.ts(x) files.',
            },
          ],
        },
      ],
    },
  },
  // Nothing loads before consent (spec 0008): the Mixpanel SDK is loaded only by `import()` in
  // `shared/analytics/client.ts`; anywhere else, go through `@/shared/analytics`. Its own rule name,
  // so it does not replace the contract block's `no-restricted-imports`.
  {
    files: webFiles,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'mixpanel-browser',
              allowTypeImports: true,
              message: 'Use @/shared/analytics: only its client.ts loads the SDK, after consent.',
            },
          ],
          // The package has no `exports`, so its files can be imported by path too.
          patterns: [
            {
              group: ['mixpanel-browser/**'],
              allowTypeImports: true,
              message: 'Use @/shared/analytics: only its client.ts loads the SDK, after consent.',
            },
          ],
        },
      ],
    },
  },
  {
    files: webFiles,
    ignores: ['web/src/shared/analytics/client.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^mixpanel-browser($|\\x2F)/]',
          message: 'Use @/shared/analytics: only its client.ts loads the SDK, after consent.',
        },
        {
          selector:
            "ImportExpression[source.type='TemplateLiteral'][source.quasis.0.value.cooked=/^mixpanel-browser($|\\x2F)/]",
          message: 'Use @/shared/analytics: only its client.ts loads the SDK, after consent.',
        },
      ],
    },
  },

  // Last: turns off every rule that would fight Prettier.
  prettier,
);
