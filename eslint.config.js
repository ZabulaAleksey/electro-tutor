import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '.astro/**',
      'blob-report/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}', 'vite.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    files: ['public/scripts/**/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
