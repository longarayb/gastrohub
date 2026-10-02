// Ponto de entrada da CLI de usuários (compilado em dist/cli/user-cli.main.js).
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';

import { loadLocalEnv } from '../shared/config/load-env.js';
import { verifyRuntimeRole } from '../shared/database/runtime-role.js';
import { createUserAdmin, runUserCli } from './user-cli.js';

// Saída da CLI só com as mensagens dela; os eventos ficam registrados em auth_events.
Logger.overrideLogger(['warn', 'error']);
loadLocalEnv();
const env = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    NODE_ENV: z.string().default('development'),
  })
  .safeParse(process.env);
if (!env.success) {
  console.error('DATABASE_URL ausente ou inválida (execute pnpm env:init).');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: env.data.DATABASE_URL,
  max: 2,
  application_name: 'gastrohub-user-cli',
});
try {
  // Mesma regra da API: nunca operar como SUPERUSER ou com BYPASSRLS.
  await verifyRuntimeRole(pool);
  process.exitCode = await runUserCli(
    process.argv.slice(2),
    { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
    createUserAdmin(drizzle({ client: pool })),
    { nodeEnv: env.data.NODE_ENV },
  );
} catch (error) {
  console.error(`Falha: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
