import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Testes unitários: sem banco. SWC emite os metadados de decorators que o NestJS usa.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
  },
});
