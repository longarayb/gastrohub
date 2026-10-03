import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MissingTenantContextError, TenantDb } from '../src/shared/tenancy/tenant-db.js';
import { testAppUrl } from './support/test-database.ts';
import { randomCnpjFormat } from './support/tenancy-kit.ts';

// M03 §7 / §12.2: o contexto é aplicado e fica restrito à transação.
describe('TenantDb', () => {
  // Uma única conexão: prova que o contexto não vaza para a próxima transação.
  const pool = new pg.Pool({ connectionString: testAppUrl(), max: 1 });
  const db = drizzle({ client: pool });
  const tenantDb = new TenantDb(db);
  const companyA = randomUUID();
  const companyB = randomUUID();

  beforeAll(async () => {
    for (const id of [companyA, companyB]) {
      await tenantDb.run({ companyId: id }, (tx) =>
        tx.execute(sql`INSERT INTO companies (id, legal_name, trade_name, tax_id)
                       VALUES (${id}, 'Tenant LTDA', 'Tenant', ${randomCnpjFormat()})`),
      );
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const visibleCompanies = async (tx: { execute: typeof db.execute }) =>
    (await tx.execute<{ id: string }>(sql`SELECT id FROM companies`)).rows.map((r) => r.id);

  it('aplica app.company_id: só a empresa do contexto é visível', async () => {
    const ids = await tenantDb.run({ companyId: companyA }, visibleCompanies);
    expect(ids).toEqual([companyA]);
  });

  it('o contexto não vaza para a transação seguinte na mesma conexão', async () => {
    await tenantDb.run({ companyId: companyA }, visibleCompanies);
    const after = await db.transaction(async (tx) => ({
      setting: (
        await tx.execute<{ v: string }>(sql`SELECT current_setting('app.company_id', true) AS v`)
      ).rows[0]?.v,
      companies: await visibleCompanies(tx),
    }));
    expect(after.setting === null || after.setting === '').toBe(true);
    expect(after.companies).toEqual([]);
  });

  it('troca de contexto entre execuções', async () => {
    expect(await tenantDb.run({ companyId: companyB }, visibleCompanies)).toEqual([companyB]);
    expect(await tenantDb.run({ companyId: companyA }, visibleCompanies)).toEqual([companyA]);
  });

  it('erro dentro da execução desfaz a transação', async () => {
    const tradeName = `Rollback ${randomUUID().slice(0, 6)}`;
    await expect(
      tenantDb.run({ companyId: companyA }, async (tx) => {
        await tx.execute(
          sql`UPDATE companies SET trade_name = ${tradeName} WHERE id = ${companyA}`,
        );
        throw new Error('falha simulada');
      }),
    ).rejects.toThrow('falha simulada');
    const names = await tenantDb.run(
      { companyId: companyA },
      async (tx) =>
        (await tx.execute<{ trade_name: string }>(sql`SELECT trade_name FROM companies`)).rows,
    );
    expect(names.map((n) => n.trade_name)).not.toContain(tradeName);
  });

  it('exige companyId ou userId', async () => {
    await expect(tenantDb.run({}, visibleCompanies)).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
  });
});
