import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { InvalidConfigError, parseConfig } from './config.schema.js';

const VALID_URL = 'postgres://gastrohub_app:s3cr3t-valor@localhost:5432/gastrohub';
const AUTH_SECRET = randomBytes(32).toString('base64url');
const BASE = { DATABASE_URL: VALID_URL, AUTH_SECRET };

describe('parseConfig', () => {
  it('aplica valores padrão seguros', () => {
    const config = parseConfig(BASE);
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      API_HOST: '127.0.0.1',
      API_PORT: 3000,
      CORS_ORIGINS: [],
      SESSION_IDLE_TTL_MINUTES: 720,
      SESSION_ABSOLUTE_TTL_HOURS: 168,
      SESSION_COOKIE_SECURE: true,
      TRUST_PROXY: false,
    });
  });

  it('converte CORS_ORIGINS em lista', () => {
    const config = parseConfig({
      ...BASE,
      CORS_ORIGINS: 'http://localhost:5173, https://app.exemplo.com ,',
    });
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://app.exemplo.com']);
  });

  it('rejeita configuração sem DATABASE_URL', () => {
    expect(() => parseConfig({ AUTH_SECRET })).toThrow(InvalidConfigError);
  });

  it('rejeita URL de banco que não é postgres', () => {
    expect(() => parseConfig({ ...BASE, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejeita porta inválida', () => {
    expect(() => parseConfig({ ...BASE, API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('nunca inclui valores recebidos na mensagem de erro', () => {
    try {
      parseConfig({
        DATABASE_URL: 'mysql://usuario:senha-super-secreta@host/db',
        AUTH_SECRET: 'curto-segredo',
        LOG_LEVEL: 'x',
      });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('senha-super-secreta');
      expect(message).not.toContain('usuario');
      expect(message).not.toContain('curto-segredo');
    }
  });

  describe('M02', () => {
    it('exige AUTH_SECRET', () => {
      expect(() => parseConfig({ DATABASE_URL: VALID_URL })).toThrow(/AUTH_SECRET/);
    });

    it('rejeita AUTH_SECRET com menos de 32 bytes ou fora de base64url', () => {
      expect(() =>
        parseConfig({ ...BASE, AUTH_SECRET: randomBytes(16).toString('base64url') }),
      ).toThrow(/AUTH_SECRET/);
      expect(() => parseConfig({ ...BASE, AUTH_SECRET: 'a+b/c='.repeat(10) })).toThrow(
        /AUTH_SECRET/,
      );
    });

    it('aplica os limites dos timeouts de sessão', () => {
      expect(() => parseConfig({ ...BASE, SESSION_IDLE_TTL_MINUTES: '10' })).toThrow(
        /SESSION_IDLE_TTL_MINUTES/,
      );
      expect(() => parseConfig({ ...BASE, SESSION_ABSOLUTE_TTL_HOURS: '721' })).toThrow(
        /SESSION_ABSOLUTE_TTL_HOURS/,
      );
    });

    it('exige timeout absoluto maior que o de inatividade', () => {
      expect(() =>
        parseConfig({ ...BASE, SESSION_IDLE_TTL_MINUTES: '120', SESSION_ABSOLUTE_TTL_HOURS: '2' }),
      ).toThrow(/SESSION_ABSOLUTE_TTL_HOURS/);
    });

    it('cookie sem Secure só é aceito em desenvolvimento (D10)', () => {
      expect(
        parseConfig({ ...BASE, NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'false' })
          .SESSION_COOKIE_SECURE,
      ).toBe(false);
      expect(() =>
        parseConfig({ ...BASE, NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }),
      ).toThrow(/SESSION_COOKIE_SECURE/);
      expect(() =>
        parseConfig({ ...BASE, NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false' }),
      ).toThrow(/SESSION_COOKIE_SECURE/);
    });

    it('TRUST_PROXY aceita false ou número de proxies (D11)', () => {
      expect(parseConfig({ ...BASE, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
      expect(parseConfig({ ...BASE, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
      expect(() => parseConfig({ ...BASE, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    });
  });
});
