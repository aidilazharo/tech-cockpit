import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const QI_TOKENS_ONLY = 'Use Qi design tokens (e.g. bg-surface-default, text-text-subdued), not raw colours.'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Components must only use Qi tokens: no hex colours, no arbitrary colour values.
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]', message: QI_TOKENS_ONLY },
        { selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]', message: QI_TOKENS_ONLY },
        { selector: 'Literal[value=/-\\[(#|rgb|hsl|oklch|color)/]', message: QI_TOKENS_ONLY },
      ],
    },
  },
])
