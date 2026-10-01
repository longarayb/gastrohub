import { describe, expect, it } from 'vitest';

import { assertTestDatabaseUrl, databaseNameFromUrl } from './database-target.ts';

describe('assertTestDatabaseUrl', () => {
  it('aceita banco com sufixo _test', () => {
    const url = 'postgres://u:p@localhost:5432/gastrohub_test';
    expect(assertTestDatabaseUrl(url, 'TEST_DATABASE_URL')).toBe(url);
  });

  it('recusa o banco de desenvolvimento', () => {
    expect(() =>
      assertTestDatabaseUrl('postgres://u:p@localhost:5432/gastrohub', 'TEST_DATABASE_URL'),
    ).toThrow(/não termina em "_test"/);
  });

  it('recusa nome que apenas contém _test no meio', () => {
    expect(() =>
      assertTestDatabaseUrl('postgres://u:p@localhost:5432/gastrohub_test_copia', 'X'),
    ).toThrow(/Recusado/);
  });

  it('recusa variável ausente', () => {
    expect(() => assertTestDatabaseUrl(undefined, 'TEST_DATABASE_URL')).toThrow(
      /não está definida/,
    );
  });

  it('extrai o nome do banco da URL', () => {
    expect(databaseNameFromUrl('postgres://u:p@h:5432/gastrohub_test?sslmode=disable')).toBe(
      'gastrohub_test',
    );
  });
});
