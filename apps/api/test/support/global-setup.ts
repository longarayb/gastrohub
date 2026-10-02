import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { assertTestDatabaseUrl } from '../../scripts/lib/database-target.ts';
import { loadLocalEnv } from '../../src/shared/config/load-env.js';

/**
 * Antes de qualquer teste de integração:
 * 1. garante que as URLs de teste apontam para um banco *_test (proteção obrigatória);
 * 2. aplica as migrations no banco de teste como gastrohub_owner.
 */
export default function setup(): void {
  loadLocalEnv();
  assertTestDatabaseUrl(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL');
  assertTestDatabaseUrl(process.env.TEST_DATABASE_MIGRATION_URL, 'TEST_DATABASE_MIGRATION_URL');

  execFileSync(
    process.execPath,
    [resolve(import.meta.dirname, '../../scripts/migrate.ts'), 'test'],
    {
      stdio: 'inherit',
    },
  );
}
