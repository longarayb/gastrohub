import { describe, expect, it } from 'vitest';

import { InvalidConfigError, parseConfig } from './config.schema.js';

const VALID_URL = 'postgres://gastrohub_app:s3cr3t-valor@localhost:5432/gastrohub';

describe('parseConfig', () => {
  it('aplica valores padrão seguros', () => {
    const config = parseConfig({ DATABASE_URL: VALID_URL });
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      API_HOST: '127.0.0.1',
      API_PORT: 3000,
      CORS_ORIGINS: [],
    });
  });

  it('converte CORS_ORIGINS em lista', () => {
    const config = parseConfig({
      DATABASE_URL: VALID_URL,
      CORS_ORIGINS: 'http://localhost:5173, https://app.exemplo.com ,',
    });
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://app.exemplo.com']);
  });

  it('rejeita configuração sem DATABASE_URL', () => {
    expect(() => parseConfig({})).toThrow(InvalidConfigError);
  });

  it('rejeita URL de banco que não é postgres', () => {
    expect(() => parseConfig({ DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('rejeita porta inválida', () => {
    expect(() => parseConfig({ DATABASE_URL: VALID_URL, API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('nunca inclui valores recebidos na mensagem de erro', () => {
    try {
      parseConfig({ DATABASE_URL: 'mysql://usuario:senha-super-secreta@host/db', LOG_LEVEL: 'x' });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('senha-super-secreta');
      expect(message).not.toContain('usuario');
    }
  });
});
