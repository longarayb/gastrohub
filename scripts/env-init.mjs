#!/usr/bin/env node
// Gera o .env local a partir do .env.example com senhas aleatórias fortes.
//
// Regras (docs/modules/M01-fundacao-tecnica.md §13):
// - nunca imprime nem registra senhas;
// - não sobrescreve um .env existente sem confirmação explícita;
// - o .env é ignorado pelo Git.

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = resolve(root, '.env.example');
const envPath = resolve(root, '.env');

const PLACEHOLDER = '__gerado_por_env_init__';
const PASSWORD_PLACEHOLDER = '<senha>';

// 32 bytes = 256 bits de entropia; base64url é seguro dentro de URLs.
const newPassword = () => randomBytes(32).toString('base64url');

const passwordKeyByRole = {
  gastrohub_owner: 'GASTROHUB_OWNER_PASSWORD',
  gastrohub_app: 'GASTROHUB_APP_PASSWORD',
};

async function confirmOverwrite() {
  if (!process.stdin.isTTY) {
    console.error(
      '.env já existe. Execute em um terminal interativo para confirmar a sobrescrita, ou remova o arquivo manualmente.',
    );
    return false;
  }
  console.warn(
    'ATENÇÃO: .env já existe. Sobrescrever gera NOVAS senhas, e um volume PostgreSQL já inicializado continuará com as senhas antigas\n' +
      '(nesse caso será preciso recriar o volume: docker compose down -v).',
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Digite "sobrescrever" para confirmar: ');
    return answer.trim() === 'sobrescrever';
  } finally {
    rl.close();
  }
}

async function main() {
  if (existsSync(envPath) && !(await confirmOverwrite())) {
    console.log('Nenhuma alteração feita. O .env existente foi mantido.');
    process.exitCode = 1;
    return;
  }

  const passwords = new Map();
  const lines = readFileSync(examplePath, 'utf8').split(/\r?\n/);

  const output = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) return line;
    const [, key, value] = match;

    if (value === PLACEHOLDER) {
      const password = newPassword();
      passwords.set(key, password);
      return `${key}=${password}`;
    }

    if (value.includes(PASSWORD_PLACEHOLDER)) {
      const role = /^postgres:\/\/([^:]+):/.exec(value)?.[1];
      const passwordKey = role ? passwordKeyByRole[role] : undefined;
      const password = passwordKey ? passwords.get(passwordKey) : undefined;
      if (!password) {
        throw new Error(`Não foi possível resolver a senha da variável ${key}.`);
      }
      return `${key}=${value.replace(PASSWORD_PLACEHOLDER, password)}`;
    }

    return line;
  });

  writeFileSync(envPath, output.join('\n'), { encoding: 'utf8', mode: 0o600 });
  console.log(`.env criado com ${passwords.size} senhas aleatórias (valores não exibidos).`);
}

main().catch((error) => {
  console.error(`env:init falhou: ${error.message}`);
  process.exitCode = 1;
});
