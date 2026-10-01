#!/usr/bin/env node
// Executa infra/database/99-validate.sql no container PostgreSQL, para cada banco.
// Uso: pnpm db:validate [banco ...]   (padrão: gastrohub gastrohub_test)
//
// O arquivo é enviado como bytes UTF-8 pelo stdin do `docker compose exec`,
// evitando a recodificação de texto feita por shells como o PowerShell 5.1.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(resolve(root, 'infra/database/99-validate.sql'));
const databases = process.argv.slice(2);
const targets = databases.length > 0 ? databases : ['gastrohub', 'gastrohub_test'];

let failed = false;
for (const db of targets) {
  console.log(`\n################ ${db} ################`);
  const result = spawnSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      db,
      '-f',
      '-',
    ],
    { cwd: root, input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  );
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
