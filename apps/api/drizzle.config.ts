import { defineConfig } from 'drizzle-kit';

// Usado apenas para GERAR migrations (não conecta ao banco).
// A aplicação das migrations é feita por scripts/migrate.ts, como gastrohub_owner.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/shared/database/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
});
