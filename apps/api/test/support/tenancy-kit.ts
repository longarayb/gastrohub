import { randomInt } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { UserAdminService } from '../../src/modules/identity/application/user-admin.service.js';
import { AuthEventsRepository } from '../../src/modules/identity/infrastructure/auth-events.repository.js';
import { IdentityRepository } from '../../src/modules/identity/infrastructure/identity.repository.js';
import { PasswordHasher } from '../../src/modules/identity/infrastructure/password-hasher.js';
import { OrganizationAdminService } from '../../src/modules/organization/application/organization-admin.service.js';
import { OrganizationRepository } from '../../src/modules/organization/infrastructure/organization.repository.js';
import { TenantDb } from '../../src/shared/tenancy/tenant-db.js';
import { testAppUrl } from './test-database.ts';

/** Serviço de administração de organização conectado ao banco de teste (como a CLI). */
export async function withOrgAdmin<T>(
  fn: (admin: OrganizationAdminService) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: testAppUrl(), max: 2 });
  try {
    const db = drizzle({ client: pool });
    const users = new UserAdminService(
      new IdentityRepository(db),
      new AuthEventsRepository(db),
      new PasswordHasher(),
    );
    return await fn(
      new OrganizationAdminService(new TenantDb(db), new OrganizationRepository(), users),
    );
  } finally {
    await pool.end();
  }
}

/** Cria empresa com uma filial e vincula os e-mails informados. */
export async function createCompany(
  tradeName: string,
  memberEmails: string[] = [],
): Promise<{ id: string; tradeName: string; taxId: string; branchId: string }> {
  return withOrgAdmin(async (admin) => {
    const company = await admin.createCompany({
      legalName: `${tradeName} LTDA`,
      tradeName,
      cnpj: randomValidCnpj(),
    });
    const branch = await admin.createBranch(company.id, {
      name: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      cep: '01310100',
    });
    for (const email of memberEmails) await admin.addMember(company.id, email);
    return { id: company.id, tradeName, taxId: company.taxId, branchId: branch.id };
  });
}

/** CNPJ com formato válido para o banco (sem garantir DV; o DV é validado na aplicação). */
export function randomCnpjFormat(): string {
  return Array.from({ length: 14 }, () => randomInt(0, 10)).join('');
}

const WEIGHTS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_DV2 = [6, ...WEIGHTS_DV1];

function dv(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += (base.charCodeAt(i) - 48) * weights[i]!;
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** CNPJ numérico aleatório com dígitos verificadores válidos (para testes via API/CLI). */
export function randomValidCnpj(): string {
  const base = Array.from({ length: 12 }, () => randomInt(0, 10)).join('');
  const d1 = dv(base, WEIGHTS_DV1);
  return `${base}${d1}${dv(base + d1, WEIGHTS_DV2)}`;
}
