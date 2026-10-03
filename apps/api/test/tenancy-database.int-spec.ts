import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { randomCnpjFormat } from './support/tenancy-kit.ts';
import { testAppUrl, testOwnerUrl, withClient } from './support/test-database.ts';

// M03 §12.1: isolamento obrigatório por tabela de tenant, direto no banco (ADR-003, docs/02 §6).

const VALID_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaA';

interface Tenant {
  companyId: string;
  branchId: string;
  userId: string;
  membershipId: string;
}

/** Executa como gastrohub_app em uma transação com o contexto informado (como o TenantDb). */
async function asApp<T>(
  context: { companyId?: string; userId?: string },
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  return withClient(testAppUrl(), async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        `SELECT set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`,
        [context.companyId ?? '', context.userId ?? ''],
      );
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function createTenant(label: string): Promise<Tenant> {
  const companyId = randomUUID();
  const userId = await withClient(testAppUrl(), async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [
        `${label.toLowerCase().replace(/\s+/g, '-')}-${randomUUID().slice(0, 8)}@teste.local`,
        label,
        VALID_HASH,
      ],
    );
    return rows[0]!.id;
  });
  return asApp({ companyId }, async (client) => {
    await client.query(
      `INSERT INTO companies (id, legal_name, trade_name, tax_id) VALUES ($1, $2, $3, $4)`,
      [companyId, `${label} LTDA`, label, randomCnpjFormat()],
    );
    const branch = await client.query<{ id: string }>(
      `INSERT INTO branches (company_id, name) VALUES ($1, 'Centro') RETURNING id`,
      [companyId],
    );
    const membership = await client.query<{ id: string }>(
      `INSERT INTO memberships (company_id, user_id) VALUES ($1, $2) RETURNING id`,
      [companyId, userId],
    );
    return {
      companyId,
      branchId: branch.rows[0]!.id,
      userId,
      membershipId: membership.rows[0]!.id,
    };
  });
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('isolamento entre empresas no banco (RLS + FORCE)', () => {
  let a: Tenant;
  let b: Tenant;

  beforeAll(async () => {
    a = await createTenant('Empresa A');
    b = await createTenant('Empresa B');
  });

  afterAll(async () => {
    // O banco de teste não é truncado; os dados ficam isolados por ids aleatórios.
  });

  describe.each([
    ['companies', (t: Tenant) => t.companyId],
    ['branches', (t: Tenant) => t.branchId],
    ['memberships', (t: Tenant) => t.membershipId],
  ] as const)('%s', (table, idOf) => {
    it('1. no contexto de A, nada de B é visível', async () => {
      const rows = await asApp(
        { companyId: a.companyId },
        async (c) => (await c.query<{ id: string }>(`SELECT id FROM ${table}`)).rows,
      );
      expect(ids(rows)).toContain(idOf(a));
      expect(ids(rows)).not.toContain(idOf(b));
    });

    it('3. sem contexto, zero linhas', async () => {
      const count = await asApp(
        {},
        async (c) =>
          (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n,
      );
      expect(count).toBe(0);
    });

    it('FORCE: nem o dono da tabela enxerga linhas sem contexto', async () => {
      const count = await withClient(
        testOwnerUrl(),
        async (c) =>
          (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n,
      );
      expect(count).toBe(0);
    });

    it('o runtime não pode apagar (sem DELETE)', async () => {
      await expect(
        asApp({ companyId: a.companyId }, (c) =>
          c.query(`DELETE FROM ${table} WHERE id = $1`, [idOf(a)]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('2. escrita fora da empresa ativa é recusada pelo banco', () => {
    it('inserir filial com company_id de B no contexto de A', async () => {
      await expect(
        asApp({ companyId: a.companyId }, (c) =>
          c.query(`INSERT INTO branches (company_id, name) VALUES ($1, 'Invasão')`, [b.companyId]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('inserir vínculo em B no contexto de A', async () => {
      await expect(
        asApp({ companyId: a.companyId }, (c) =>
          c.query(`INSERT INTO memberships (company_id, user_id) VALUES ($1, $2)`, [
            b.companyId,
            a.userId,
          ]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('mover filial de A para B', async () => {
      await expect(
        asApp({ companyId: a.companyId }, (c) =>
          c.query(`UPDATE branches SET company_id = $1 WHERE id = $2`, [b.companyId, a.branchId]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('atualizar dados de B no contexto de A não afeta nenhuma linha', async () => {
      const updated = await asApp(
        { companyId: a.companyId },
        async (c) =>
          (
            await c.query(`UPDATE companies SET trade_name = 'Hackeada' WHERE id = $1`, [
              b.companyId,
            ])
          ).rowCount,
      );
      expect(updated).toBe(0);
    });

    it('criar empresa sem contexto é recusado', async () => {
      await expect(
        asApp({}, (c) =>
          c.query(
            `INSERT INTO companies (id, legal_name, trade_name, tax_id) VALUES ($1, 'X', 'X', $2)`,
            [randomUUID(), randomCnpjFormat()],
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('4. contexto de usuário (seletor de empresas)', () => {
    it('vê só os próprios vínculos e as empresas em que é membro; nenhuma filial', async () => {
      const result = await asApp({ userId: a.userId }, async (c) => ({
        memberships: (await c.query<{ id: string }>('SELECT id FROM memberships')).rows,
        companies: (await c.query<{ id: string }>('SELECT id FROM companies')).rows,
        branches: (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM branches')).rows[0]!
          .n,
      }));
      expect(ids(result.memberships)).toEqual([a.membershipId]);
      expect(ids(result.companies)).toEqual([a.companyId]);
      expect(result.branches).toBe(0);
    });

    it('vínculo revogado deixa de dar visibilidade da empresa', async () => {
      const tenant = await createTenant('Empresa C');
      await asApp({ companyId: tenant.companyId }, (c) =>
        c.query(`UPDATE memberships SET status = 'revoked' WHERE id = $1`, [tenant.membershipId]),
      );
      const companies = await asApp(
        { userId: tenant.userId },
        async (c) => (await c.query<{ id: string }>('SELECT id FROM companies')).rows,
      );
      expect(companies).toEqual([]);
    });

    it('contexto de usuário não permite escrever', async () => {
      await expect(
        asApp({ userId: a.userId }, (c) =>
          c.query(`INSERT INTO branches (company_id, name) VALUES ($1, 'Via usuário')`, [
            a.companyId,
          ]),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('constraints (§3)', () => {
    it('CNPJ, UF, CEP e nome de filial único por empresa', async () => {
      const ctx = { companyId: a.companyId };
      const violation = (sql: string, params: unknown[]) =>
        expect(asApp(ctx, (c) => c.query(sql, params))).rejects.toMatchObject({
          code: expect.stringMatching(/^(23514|23505)$/),
        });
      await violation(`UPDATE companies SET tax_id = '11.222.333/0001-81' WHERE id = $1`, [
        a.companyId,
      ]);
      await violation(`INSERT INTO branches (company_id, name, state) VALUES ($1, 'X1', 'XX')`, [
        a.companyId,
      ]);
      await violation(
        `INSERT INTO branches (company_id, name, postal_code) VALUES ($1, 'X2', '0131-010')`,
        [a.companyId],
      );
      await violation(`INSERT INTO branches (company_id, name) VALUES ($1, 'Centro')`, [
        a.companyId,
      ]);
    });

    it('sessions.active_company_id referencia companies (FK)', async () => {
      await expect(
        withClient(testAppUrl(), (c) =>
          c.query(`UPDATE sessions SET active_company_id = $1 WHERE false`, [randomUUID()]),
        ),
      ).resolves.toBeDefined();
      const fk = await withClient(
        testOwnerUrl(),
        async (c) =>
          (
            await c.query(
              `SELECT count(*)::int AS n FROM pg_constraint
              WHERE conname = 'sessions_active_company_id_companies_id_fk'`,
            )
          ).rows[0].n,
      );
      expect(fk).toBe(1);
    });
  });
});
