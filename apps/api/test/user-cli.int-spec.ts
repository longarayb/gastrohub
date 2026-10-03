import { Readable, Writable } from 'node:stream';

import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runUserCli } from '../src/cli/user-cli.js';
import {
  BrowserClient,
  startAuthApp,
  STRONG_PASSWORD,
  uniqueEmail,
  withUserAdmin,
} from './support/auth-kit.ts';
import { testOwnerUrl, withClient } from './support/test-database.ts';

class Sink extends Writable {
  text = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.text += chunk.toString('utf8');
    done();
  }
}

async function cli(args: string[], stdin = '', nodeEnv = 'test') {
  const stdout = new Sink();
  const stderr = new Sink();
  const code = await withUserAdmin((admin) =>
    runUserCli(args, { stdin: Readable.from([stdin]), stdout, stderr }, admin, { nodeEnv }),
  );
  return { code, stdout: stdout.text, stderr: stderr.text };
}

async function activeSessions(email: string): Promise<number> {
  return withClient(testOwnerUrl(), async (db) => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE u.email = $1 AND s.revoked_at IS NULL`,
      [email],
    );
    return rows[0].n as number;
  });
}

// M02 §6.9 (CLI em src/cli, decisão de 2026-10-02).
describe('CLI de usuários', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startAuthApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('create: cria o usuário com hash argon2id válido e e-mail normalizado', async () => {
    const email = uniqueEmail('cli');
    const result = await cli(
      ['create', '--email', email.toUpperCase(), '--name', 'Via CLI', '--password-stdin'],
      `${STRONG_PASSWORD}\n`,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain(STRONG_PASSWORD);

    const [row] = await withClient(testOwnerUrl(), async (db) => {
      const { rows } = await db.query('SELECT email, password_hash FROM users WHERE email = $1', [
        email,
      ]);
      return rows;
    });
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect((await new BrowserClient(app).login(email, STRONG_PASSWORD)).status).toBe(200);
  });

  it('--password-stdin ignora BOM inicial e CRLF final (pipe do PowerShell 5.1)', async () => {
    const email = uniqueEmail('cli');
    const result = await cli(
      ['create', '--email', email, '--name', 'BOM', '--password-stdin'],
      String.fromCharCode(0xfeff) + STRONG_PASSWORD + '\r\n',
    );
    expect(result.code).toBe(0);
    expect((await new BrowserClient(app).login(email, STRONG_PASSWORD)).status).toBe(200);
  });

  it('create: aplica a política de senha e recusa duplicado', async () => {
    const email = uniqueEmail('cli');
    const weak = await cli(
      ['create', '--email', email, '--name', 'X', '--password-stdin'],
      'curta',
    );
    expect(weak.code).toBe(1);
    expect(weak.stderr).toMatch(/12 caracteres/);
    expect(weak.stderr).not.toContain('curta');

    await cli(['create', '--email', email, '--name', 'X', '--password-stdin'], STRONG_PASSWORD);
    const duplicate = await cli(
      ['create', '--email', email, '--name', 'X', '--password-stdin'],
      STRONG_PASSWORD,
    );
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr).toMatch(/Já existe/);
  });

  it('set-password: redefine e revoga todas as sessões', async () => {
    const email = uniqueEmail('cli');
    await cli(['create', '--email', email, '--name', 'X', '--password-stdin'], STRONG_PASSWORD);
    const device = new BrowserClient(app);
    await device.login(email, STRONG_PASSWORD);
    expect(await activeSessions(email)).toBe(1);

    const result = await cli(
      ['set-password', email, '--password-stdin'],
      'senha redefinida pela cli',
    );
    expect(result.code).toBe(0);
    expect(await activeSessions(email)).toBe(0);
    expect((await device.get('/api/v1/auth/session')).status).toBe(401);
    expect((await new BrowserClient(app).login(email, 'senha redefinida pela cli')).status).toBe(
      200,
    );
  });

  it('disable revoga as sessões e impede login; enable reativa', async () => {
    const email = uniqueEmail('cli');
    await cli(['create', '--email', email, '--name', 'X', '--password-stdin'], STRONG_PASSWORD);
    await new BrowserClient(app).login(email, STRONG_PASSWORD);

    expect((await cli(['disable', email])).code).toBe(0);
    expect(await activeSessions(email)).toBe(0);
    expect((await new BrowserClient(app).login(email, STRONG_PASSWORD)).status).toBe(401);

    expect((await cli(['enable', email])).code).toBe(0);
    expect((await new BrowserClient(app).login(email, STRONG_PASSWORD)).status).toBe(200);
  });

  it('senha nunca por argumento: sem TTY e sem --password-stdin, recusa', async () => {
    const email = uniqueEmail('cli');
    await cli(['create', '--email', email, '--name', 'X', '--password-stdin'], STRONG_PASSWORD);
    const result = await cli(['set-password', email]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/terminal interativo|--password-stdin/);
  });

  it('seed-dev só roda com NODE_ENV=development; comando desconhecido: uso (código 2)', async () => {
    const seed = await cli(['seed-dev', '--password-stdin'], STRONG_PASSWORD, 'test');
    expect(seed.code).toBe(1);
    expect(seed.stderr).toMatch(/NODE_ENV=development/);
    expect((await cli(['qualquer'])).code).toBe(2);
  });
});
