import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { runOrganizationCli } from '../src/cli/organization-cli.js';
import { createUser } from './support/auth-kit.ts';
import { randomValidCnpj, withOrgAdmin } from './support/tenancy-kit.ts';
import { testOwnerUrl, withClient } from './support/test-database.ts';

class Sink extends Writable {
  text = '';
  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.text += chunk.toString('utf8');
    done();
  }
}

async function cli(args: string[]) {
  const stdout = new Sink();
  const stderr = new Sink();
  const code = await withOrgAdmin((admin) => runOrganizationCli(args, { stdout, stderr }, admin));
  return { code, stdout: stdout.text, stderr: stderr.text };
}

const idFrom = (out: string) => /id: ([0-9a-f-]{36})/.exec(out)?.[1] ?? '';

/** Consulta como owner com o contexto da empresa (RLS + FORCE valem também para o owner). */
async function ownerInCompany<T>(companyId: string, sql: string, params: unknown[] = []) {
  return withClient(testOwnerUrl(), async (c) => {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.company_id', $1, true)`, [companyId]);
    const { rows } = await c.query(sql, params);
    await c.query('COMMIT');
    return rows as T[];
  });
}

// M03 §9.
describe('CLI de organização', () => {
  it('company:create valida o CNPJ (incl. alfanumérico) e imprime o id', async () => {
    const created = await cli([
      'company:create',
      '--legal-name',
      'Hamburgueria CLI LTDA',
      '--trade-name',
      'Hamburgueria CLI',
      '--cnpj',
      randomValidCnpj(),
    ]);
    expect(created.code).toBe(0);
    expect(idFrom(created.stdout)).toMatch(/^[0-9a-f-]{36}$/);

    const invalid = await cli([
      'company:create',
      '--legal-name',
      'X',
      '--trade-name',
      'X',
      '--cnpj',
      '11.222.333/0001-82',
    ]);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toMatch(/CNPJ inválido/);
  });

  it('CNPJ duplicado é recusado com mensagem clara', async () => {
    const cnpj = randomValidCnpj();
    const args = ['company:create', '--legal-name', 'D', '--trade-name', 'D', '--cnpj', cnpj];
    expect((await cli(args)).code).toBe(0);
    const duplicate = await cli(args);
    expect(duplicate.code).toBe(1);
    expect(duplicate.stderr).toMatch(/Já existe uma empresa com este CNPJ/);
  });

  it('branch:create normaliza CEP/UF, valida fuso e virada do dia, e recusa nome repetido', async () => {
    const companyId = idFrom(
      (
        await cli([
          'company:create',
          '--legal-name',
          'Filiais LTDA',
          '--trade-name',
          'Filiais',
          '--cnpj',
          randomValidCnpj(),
        ])
      ).stdout,
    );
    const ok = await cli([
      'branch:create',
      companyId,
      '--name',
      'Shopping',
      '--cep',
      '01310-100',
      '--state',
      'sp',
      '--timezone',
      'America/Manaus',
      '--cutoff',
      '03:30',
    ]);
    expect(ok.code).toBe(0);
    const [branch] = await ownerInCompany<{
      postal_code: string;
      state: string;
      timezone: string;
      cutoff: string;
    }>(
      companyId,
      `SELECT postal_code, state, timezone, business_day_cutoff::text AS cutoff FROM branches WHERE id = $1`,
      [idFrom(ok.stdout)],
    );
    expect(branch).toEqual({
      postal_code: '01310100',
      state: 'SP',
      timezone: 'America/Manaus',
      cutoff: '03:30:00',
    });

    for (const [flag, value, message] of [
      ['--timezone', 'Brasil/Brasilia', /Fuso/],
      ['--cutoff', '25:00', /HH:MM/],
      ['--state', 'XX', /UF/],
    ] as const) {
      const result = await cli(['branch:create', companyId, '--name', `F ${value}`, flag, value]);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(message);
    }
    expect((await cli(['branch:create', companyId, '--name', 'Shopping'])).stderr).toMatch(
      /Já existe uma filial com este nome/,
    );
  });

  it('member:add / member:remove e suspender/reativar empresa', async () => {
    const user = await createUser();
    const companyId = idFrom(
      (
        await cli([
          'company:create',
          '--legal-name',
          'Membros LTDA',
          '--trade-name',
          'Membros',
          '--cnpj',
          randomValidCnpj(),
        ])
      ).stdout,
    );
    expect((await cli(['member:add', companyId, user.email.toUpperCase()])).code).toBe(0);
    const status = async () =>
      (
        await ownerInCompany<{ status: string }>(
          companyId,
          'SELECT status FROM memberships WHERE user_id = $1',
          [user.id],
        )
      )[0]?.status;
    expect(await status()).toBe('active');
    expect((await cli(['member:remove', companyId, user.email])).code).toBe(0);
    expect(await status()).toBe('revoked');
    // Reativar o vínculo (upsert).
    expect((await cli(['member:add', companyId, user.email])).code).toBe(0);
    expect(await status()).toBe('active');

    expect((await cli(['company:suspend', companyId])).code).toBe(0);
    expect((await cli(['company:activate', companyId])).code).toBe(0);
  });

  it('erros de uso e de dados', async () => {
    expect((await cli(['company:suspend', 'nao-uuid'])).code).toBe(2);
    expect((await cli(['comando-inexistente'])).code).toBe(2);
    expect((await cli(['company:create', '--opcao-invalida', 'x'])).code).toBe(2);
    const missing = await cli(['company:suspend', '01a0f904-550e-7054-ac7c-b7a61c0a0b3d']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/Empresa não encontrada/);
    const noUser = await cli([
      'member:add',
      '01a0f904-550e-7054-ac7c-b7a61c0a0b3d',
      'ninguem@teste.local',
    ]);
    expect(noUser.code).toBe(1);
    expect(noUser.stderr).toMatch(/Usuário não encontrado/);
  });
});
