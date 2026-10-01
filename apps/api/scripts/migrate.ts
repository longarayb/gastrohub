// Aplica as migrations SQL de ./drizzle como gastrohub_owner.
//
//   node scripts/migrate.ts dev    → DATABASE_MIGRATION_URL      (banco gastrohub)
//   node scripts/migrate.ts test   → TEST_DATABASE_MIGRATION_URL (banco *_test, obrigatório)

import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { loadLocalEnv } from '../src/shared/config/load-env.ts';
import { assertTestDatabaseUrl, databaseNameFromUrl, requireEnv } from './lib/database-target.ts';

const target = process.argv[2];
if (target !== 'dev' && target !== 'test') {
  console.error('Uso: node scripts/migrate.ts <dev|test>');
  process.exit(2);
}

loadLocalEnv();
let url: string;
try {
  url =
    target === 'test'
      ? assertTestDatabaseUrl(
          process.env.TEST_DATABASE_MIGRATION_URL,
          'TEST_DATABASE_MIGRATION_URL',
        )
      : requireEnv('DATABASE_MIGRATION_URL');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1, application_name: 'gastrohub-migrate' });
try {
  // Migrations como superusuário criariam objetos fora do modelo de privilégios
  // (os default privileges valem para objetos criados por gastrohub_owner).
  const { rows } = await pool.query<{ rolname: string; rolsuper: boolean }>(
    'SELECT rolname, rolsuper FROM pg_roles WHERE rolname = current_user',
  );
  const role = rows[0];
  if (!role || role.rolsuper) {
    throw new Error('Migrations não podem rodar como superusuário; use gastrohub_owner.');
  }

  await migrate(drizzle({ client: pool }), {
    migrationsFolder: resolve(import.meta.dirname, '../drizzle'),
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations',
  });
  console.log(
    `Migrations aplicadas em "${databaseNameFromUrl(url)}" como "${role.rolname}" (alvo: ${target}).`,
  );
} catch (error) {
  console.error(`Falha nas migrations: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
