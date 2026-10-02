#!/usr/bin/env node
// Gera o .env local a partir do .env.example com senhas aleatórias fortes.
//
//   pnpm env:init                    cria o .env (pede confirmação se já existir)
//   pnpm env:init -- --add-missing   acrescenta ao .env existente só as variáveis
//                                    ausentes (ex.: AUTH_SECRET do M02), sem tocar
//                                    nas senhas do banco já em uso
//
// Regras (docs/modules/M01-fundacao-tecnica.md §13, M02 §12):
// - nunca imprime nem registra senhas ou segredos;
// - não sobrescreve um .env existente sem confirmação explícita;
// - o .env é ignorado pelo Git.

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = resolve(root, '.env.example');
const envPath = resolve(root, '.env');

const PLACEHOLDER = '__gerado_por_env_init__';
const PASSWORD_PLACEHOLDER = '<senha>';

// 32 bytes = 256 bits de entropia; base64url é seguro dentro de URLs.
const newSecret = () => randomBytes(32).toString('base64url');

const passwordKeyByRole = {
  gastrohub_owner: 'GASTROHUB_OWNER_PASSWORD',
  gastrohub_app: 'GASTROHUB_APP_PASSWORD',
};

const VAR_LINE = /^([A-Z0-9_]+)=(.*)$/;

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = VAR_LINE.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

/** Resolve o valor de uma linha do exemplo, gerando segredos e montando URLs. */
function resolveValue(key, value, secrets) {
  if (value === PLACEHOLDER) {
    const secret = newSecret();
    secrets.set(key, secret);
    return secret;
  }
  if (value.includes(PASSWORD_PLACEHOLDER)) {
    const role = /^postgres:\/\/([^:]+):/.exec(value)?.[1];
    const passwordKey = role ? passwordKeyByRole[role] : undefined;
    const password = passwordKey ? secrets.get(passwordKey) : undefined;
    if (!password) {
      throw new Error(`Não foi possível resolver a senha da variável ${key}.`);
    }
    return value.replace(PASSWORD_PLACEHOLDER, password);
  }
  return value;
}

async function confirmOverwrite() {
  if (!process.stdin.isTTY) {
    console.error(
      '.env já existe. Execute em um terminal interativo para confirmar a sobrescrita, use --add-missing ou remova o arquivo manualmente.',
    );
    return false;
  }
  console.warn(
    'ATENÇÃO: .env já existe. Sobrescrever gera NOVAS senhas, e um volume PostgreSQL já inicializado continuará com as senhas antigas\n' +
      '(nesse caso será preciso recriar o volume: docker compose down -v).\n' +
      'Para só acrescentar variáveis novas, use: pnpm env:init -- --add-missing',
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Digite "sobrescrever" para confirmar: ');
    return answer.trim() === 'sobrescrever';
  } finally {
    rl.close();
  }
}

function addMissing() {
  if (!existsSync(envPath)) {
    console.error('.env não existe. Execute pnpm env:init para criá-lo.');
    process.exitCode = 1;
    return;
  }
  const existing = parseEnv(readFileSync(envPath, 'utf8'));
  // As senhas já em uso servem para montar URLs novas que dependam delas.
  const secrets = new Map(existing);
  const added = [];
  const lines = [];

  for (const line of readFileSync(examplePath, 'utf8').split(/\r?\n/)) {
    const match = VAR_LINE.exec(line);
    if (!match || existing.has(match[1])) continue;
    const [, key, value] = match;
    lines.push(`${key}=${resolveValue(key, value, secrets)}`);
    added.push(key);
  }

  if (added.length === 0) {
    console.log('.env já contém todas as variáveis do .env.example. Nada alterado.');
    return;
  }
  const current = readFileSync(envPath, 'utf8');
  const separator = current.endsWith('\n') || current.length === 0 ? '' : '\n';
  appendFileSync(envPath, `${separator}${lines.join('\n')}\n`, 'utf8');
  console.log(`Variáveis acrescentadas ao .env (valores não exibidos): ${added.join(', ')}`);
}

async function createEnv() {
  if (existsSync(envPath) && !(await confirmOverwrite())) {
    console.log('Nenhuma alteração feita. O .env existente foi mantido.');
    process.exitCode = 1;
    return;
  }

  const secrets = new Map();
  const output = readFileSync(examplePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      const match = VAR_LINE.exec(line);
      if (!match) return line;
      const [, key, value] = match;
      return `${key}=${resolveValue(key, value, secrets)}`;
    });

  writeFileSync(envPath, output.join('\n'), { encoding: 'utf8', mode: 0o600 });
  console.log(`.env criado com ${secrets.size} segredos aleatórios (valores não exibidos).`);
}

const run = process.argv.includes('--add-missing') ? addMissing : createEnv;
Promise.resolve(run()).catch((error) => {
  console.error(`env:init falhou: ${error.message}`);
  process.exitCode = 1;
});
