import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          argsIgnorePattern: '^[A-Z_]',
          caughtErrors: 'none',
        },
      ],
    },
  },
  { files: ['e2e/**/*.js', '*.config.js'], languageOptions: { globals: globals.node } },
  { files: ['src/**/*.test.{js,jsx}', 'src/test/**/*.js'], languageOptions: { globals: { ...globals.node, ...globals.vitest } } },
  { files: ['public/firebase-messaging-sw.js'], languageOptions: { globals: { ...globals.serviceworker, firebase: 'readonly' } } },
])
