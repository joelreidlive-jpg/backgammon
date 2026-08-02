import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='Math'][callee.property.name='random']",
          message: 'Randomness that affects play must come from the server CSPRNG.',
        },
      ],
    },
  },
  {
    // The rules engine is the one thing shared with the browser, so it stays
    // free of platform and runtime dependencies.
    files: ['packages/rules/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['@bg/*', 'node:*'] }],
    },
  },
  {
    // The evaluator must never reach the client: a player could read the
    // engine's own analysis of the position straight out of the bundle.
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@bg/ai', message: 'The engine is server-side only; use @bg/protocol types.' },
            { name: '@bg/coach', message: 'The coach is server-side only; use @bg/protocol types.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: { ...globals.worker, crypto: 'readonly' } },
  },
  {
    files: ['**/*.test.ts', 'vitest.config.ts', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
