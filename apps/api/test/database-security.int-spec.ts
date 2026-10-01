import { describe, expect, it } from 'vitest';

import { databaseNameFromUrl } from '../scripts/lib/database-target.ts';
import { testAppUrl, testOwnerUrl, withClient } from './support/test-database.ts';

const APP = 'gastrohub_app';
const OWNER = 'gastrohub_owner';

// Validação explícita do modelo de papéis após bootstrap + migrations
// (docs/02-BANCO-DE-DADOS.md §2, docs/modules/M01-fundacao-tecnica.md §7).
describe('banco de teste: configuração e privilégios', () => {
  const database = databaseNameFromUrl(testAppUrl());

  it('usa ICU pt-BR, UTF8, owner gastrohub_owner e PostgreSQL 18', async () => {
    const row = await withClient(testOwnerUrl(), async (client) => {
      const { rows } = await client.query<{
        owner: string;
        encoding: string;
        provider: string;
        locale: string;
        server_version_num: string;
      }>(
        `SELECT pg_get_userbyid(datdba) AS owner,
                pg_encoding_to_char(encoding) AS encoding,
                datlocprovider AS provider,
                datlocale AS locale,
                current_setting('server_version_num') AS server_version_num
           FROM pg_database WHERE datname = current_database()`,
      );
      return rows[0];
    });
    expect(row).toMatchObject({ owner: OWNER, encoding: 'UTF8', provider: 'i', locale: 'pt-BR' });
    expect(Number(row?.server_version_num)).toBeGreaterThanOrEqual(180000);
  });

  it('ordena texto conforme pt-BR', async () => {
    const order = await withClient(testAppUrl(), async (client) => {
      const { rows } = await client.query<{ x: string }>(
        `SELECT x FROM (VALUES ('z'), ('É'), ('b'), ('á'), ('ç'), ('a'), ('d')) AS t(x) ORDER BY x`,
      );
      return rows.map((r) => r.x);
    });
    expect(order).toEqual(['a', 'á', 'b', 'ç', 'd', 'É', 'z']);
  });

  it.each([APP, OWNER])(
    '%s não é SUPERUSER, não tem BYPASSRLS nem cria bancos/papéis',
    async (role) => {
      const row = await withClient(testOwnerUrl(), async (client) => {
        const { rows } = await client.query(
          `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
           FROM pg_roles WHERE rolname = $1`,
          [role],
        );
        return rows[0];
      });
      expect(row).toEqual({
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      });
    },
  );

  it('gastrohub_app: apenas CONNECT no banco e USAGE (sem CREATE) no schema public', async () => {
    const row = await withClient(testOwnerUrl(), async (client) => {
      const { rows } = await client.query(
        `SELECT has_database_privilege($1, current_database(), 'CONNECT')   AS connect,
                has_database_privilege($1, current_database(), 'CREATE')    AS create_db,
                has_database_privilege($1, current_database(), 'TEMPORARY') AS temporary,
                has_schema_privilege($1, 'public', 'USAGE')                 AS public_usage,
                has_schema_privilege($1, 'public', 'CREATE')                AS public_create`,
        [APP],
      );
      return rows[0];
    });
    expect(row).toEqual({
      connect: true,
      create_db: false,
      temporary: false,
      public_usage: true,
      public_create: false,
    });
  });

  it('gastrohub_app não é dono de nenhum objeto', async () => {
    const row = await withClient(testOwnerUrl(), async (client) => {
      const { rows } = await client.query(
        `SELECT (SELECT count(*)::int FROM pg_class     WHERE relowner = to_regrole($1)) AS relations,
                (SELECT count(*)::int FROM pg_namespace WHERE nspowner = to_regrole($1)) AS schemas,
                (SELECT count(*)::int FROM pg_proc      WHERE proowner = to_regrole($1)) AS functions`,
        [APP],
      );
      return rows[0];
    });
    expect(row).toEqual({ relations: 0, schemas: 0, functions: 0 });
  });

  it('tabelas criadas pelo owner dão ao app somente SELECT/INSERT/UPDATE/DELETE', async () => {
    // Tabela técnica temporária criada e descartada dentro de uma transação (ROLLBACK).
    const privileges = await withClient(testOwnerUrl(), async (client) => {
      await client.query('BEGIN');
      try {
        await client.query('CREATE TABLE public.m01_privilege_probe (id int)');
        const { rows } = await client.query(
          `SELECT p AS privilege, has_table_privilege($1, 'public.m01_privilege_probe', p) AS granted
             FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p`,
          [APP],
        );
        return Object.fromEntries(rows.map((r) => [r.privilege, r.granted]));
      } finally {
        await client.query('ROLLBACK');
      }
    });
    expect(privileges).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: true,
      DELETE: true,
      TRUNCATE: false,
      REFERENCES: false,
      TRIGGER: false,
    });
  });

  it.each([
    ['CREATE TABLE', 'CREATE TABLE public.m01_ddl_probe (id int)'],
    ['CREATE SCHEMA', 'CREATE SCHEMA m01_ddl_probe'],
    ['CREATE TEMP TABLE', 'CREATE TEMP TABLE m01_ddl_probe (id int)'],
    [
      'CREATE FUNCTION',
      'CREATE FUNCTION public.m01_ddl_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$',
    ],
  ])('gastrohub_app não pode executar DDL: %s', async (_label, statement) => {
    await withClient(testAppUrl(), async (client) => {
      await expect(client.query(statement)).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('gastrohub_app não acessa a tabela de controle de migrations', async () => {
    await withClient(testAppUrl(), async (client) => {
      await expect(
        client.query('SELECT * FROM drizzle.__drizzle_migrations'),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('migrations aplicadas e nenhuma tabela de negócio no schema public', async () => {
    const row = await withClient(testOwnerUrl(), async (client) => {
      const { rows } = await client.query(
        `SELECT (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
                (SELECT count(*)::int FROM information_schema.tables
                  WHERE table_schema = 'public') AS public_tables`,
      );
      return rows[0];
    });
    expect(row?.migrations).toBeGreaterThanOrEqual(1);
    expect(row?.public_tables).toBe(0);
  });

  it(`o banco de teste é "${database}" (sufixo _test)`, () => {
    expect(database.endsWith('_test')).toBe(true);
  });
});
