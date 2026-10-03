import { defineConfig } from 'drizzle-kit';

// Usado apenas para GERAR migrations (não conecta ao banco).
// A aplicação das migrations é feita por scripts/migrate.ts, como gastrohub_owner.
// Schema agregado: o schema de cada módulo (glob), sem que shared/ dependa de módulos (ADR-001).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/infrastructure/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
});
