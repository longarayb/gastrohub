import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { assertTestDatabaseUrl } from '../../scripts/lib/database-target.ts';
import { type AppConfig, parseConfig } from '../../src/shared/config/config.schema.js';

/** URL de runtime (gastrohub_app) do banco de teste. */
export function testAppUrl(): string {
  return assertTestDatabaseUrl(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL');
}

/** URL de migrations (gastrohub_owner) do banco de teste. */
export function testOwnerUrl(): string {
  return assertTestDatabaseUrl(
    process.env.TEST_DATABASE_MIGRATION_URL,
    'TEST_DATABASE_MIGRATION_URL',
  );
}

/** Mesma URL de teste, autenticando como outro usuário. */
export function withCredentials(url: string, user: string, password: string): string {
  const parsed = new URL(url);
  parsed.username = encodeURIComponent(user);
  parsed.password = encodeURIComponent(password);
  return parsed.toString();
}

/** URL do superusuário do container apontando para o banco de teste (somente em testes). */
export function testSuperuserUrl(): string {
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) throw new Error('POSTGRES_PASSWORD não está definida (execute pnpm env:init).');
  return withCredentials(testAppUrl(), 'postgres', password);
}

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return parseConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testAppUrl(),
    ...overrides,
  });
}

export function randomSecret(): string {
  return randomBytes(24).toString('base64url');
}

export async function withClient<T>(
  url: string,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url, application_name: 'gastrohub-tests' });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
