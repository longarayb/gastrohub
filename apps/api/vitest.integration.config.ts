import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Testes de integração contra PostgreSQL real (banco *_test, obrigatório).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.int-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    setupFiles: ['./test/support/load-env.ts'],
    // Os arquivos compartilham o mesmo banco de teste.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
