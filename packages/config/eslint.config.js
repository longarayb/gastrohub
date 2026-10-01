// Configuração ESLint base (flat config) compartilhada pelo monorepo.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/drizzle/meta/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Sem consistent-type-imports: o autofix converteria em `import type` classes
      // usadas pela injeção de dependência do NestJS, quebrando a DI em runtime.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Frontend: código de navegador com React.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Scripts de linha de comando: saída no console é o comportamento esperado.
    files: ['scripts/**', '**/scripts/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
