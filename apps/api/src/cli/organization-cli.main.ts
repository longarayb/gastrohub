// Ponto de entrada da CLI de organização (compilado em dist/cli/organization-cli.main.js).
import 'reflect-metadata';

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';

import { UserAdminService } from '../modules/identity/index.js';
import { OrganizationAdminService } from '../modules/organization/application/organization-admin.service.js';
import { AuthEventsRepository } from '../modules/identity/infrastructure/auth-events.repository.js';
import { IdentityRepository } from '../modules/identity/infrastructure/identity.repository.js';
import { PasswordHasher } from '../modules/identity/infrastructure/password-hasher.js';
import { OrganizationRepository } from '../modules/organization/infrastructure/organization.repository.js';
import { loadLocalEnv } from '../shared/config/load-env.js';
import { verifyRuntimeRole } from '../shared/database/runtime-role.js';
import { TenantDb } from '../shared/tenancy/tenant-db.js';
import { runOrganizationCli } from './organization-cli.js';

loadLocalEnv();
const env = z
  .object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) })
  .safeParse(process.env);
if (!env.success) {
  console.error('DATABASE_URL ausente ou inválida (execute pnpm env:init).');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: env.data.DATABASE_URL,
  max: 2,
  application_name: 'gastrohub-organization-cli',
});
try {
  // Mesma regra da API: nunca operar como SUPERUSER ou com BYPASSRLS (RLS precisa valer).
  await verifyRuntimeRole(pool);
  const db = drizzle({ client: pool });
  const users = new UserAdminService(
    new IdentityRepository(db),
    new AuthEventsRepository(db),
    new PasswordHasher(),
  );
  const admin = new OrganizationAdminService(new TenantDb(db), new OrganizationRepository(), users);
  process.exitCode = await runOrganizationCli(
    process.argv.slice(2),
    { stdout: process.stdout, stderr: process.stderr },
    admin,
  );
} catch (error) {
  console.error(`Falha: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
