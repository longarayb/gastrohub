import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.factory.js';
import { databaseNameFromUrl } from '../scripts/lib/database-target.ts';
import {
  randomSecret,
  testAppUrl,
  testConfig,
  testSuperuserUrl,
  withClient,
  withCredentials,
} from './support/test-database.ts';

/** Tenta inicializar a API com a URL informada; devolve o erro de inicialização, se houver. */
async function bootError(databaseUrl: string): Promise<unknown> {
  const app = await createApp(testConfig({ DATABASE_URL: databaseUrl }));
  try {
    await app.init();
    return undefined;
  } catch (error) {
    return error;
  } finally {
    await app.close().catch(() => undefined);
  }
}

describe('verificação do papel de runtime no boot (ADR-003)', () => {
  it('inicia normalmente como gastrohub_app', async () => {
    expect(await bootError(testAppUrl())).toBeUndefined();
  });

  it('recusa iniciar conectada como SUPERUSER', async () => {
    const error = await bootError(testSuperuserUrl());
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('UnsafeDatabaseRoleError');
    expect((error as Error).message).toMatch(/SUPERUSER/);
  });

  it('recusa iniciar conectada com um papel que possui BYPASSRLS', async () => {
    const role = `gastrohub_test_bypass_${randomSecret()
      .slice(0, 8)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, 'x')}`;
    const password = randomSecret();
    const database = databaseNameFromUrl(testAppUrl());

    await withClient(testSuperuserUrl(), async (admin) => {
      await admin.query(`CREATE ROLE ${role} LOGIN BYPASSRLS NOSUPERUSER PASSWORD '${password}'`);
      await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
    });

    try {
      const error = await bootError(withCredentials(testAppUrl(), role, password));
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('UnsafeDatabaseRoleError');
      expect((error as Error).message).toMatch(/BYPASSRLS/);
    } finally {
      await withClient(testSuperuserUrl(), async (admin) => {
        await admin.query(`REVOKE CONNECT ON DATABASE ${database} FROM ${role}`);
        await admin.query(`DROP ROLE IF EXISTS ${role}`);
      });
    }
  });
});
