import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  csrfTokenFor,
  deriveAuthKeys,
  generateSessionToken,
  hashSessionToken,
  isValidCsrfToken,
  loginIdentifierHash,
} from './crypto.js';

const keys = deriveAuthKeys(randomBytes(32).toString('base64url'));

describe('tokens de sessão (§3)', () => {
  it('gera 32 bytes em base64url (43 caracteres) e guarda só o SHA-256', () => {
    const { token, hash } = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hash).toEqual(createHash('sha256').update(Buffer.from(token, 'base64url')).digest());
    expect(hash.toString('base64url')).not.toBe(token);
  });

  it('tokens distintos a cada geração', () => {
    expect(generateSessionToken().token).not.toBe(generateSessionToken().token);
  });

  it('hash determinístico do token recebido', () => {
    const { token, hash } = generateSessionToken();
    expect(hashSessionToken(token)).toEqual(hash);
  });

  it('rejeita formatos inválidos sem consultar o banco', () => {
    expect(hashSessionToken(undefined)).toBeNull();
    expect(hashSessionToken('')).toBeNull();
    expect(hashSessionToken('curto')).toBeNull();
    expect(hashSessionToken('a'.repeat(44))).toBeNull();
    expect(hashSessionToken('+'.repeat(43))).toBeNull();
  });
});

describe('CSRF (§9.4)', () => {
  const sessionId = '01a0f904-550e-7054-ac7c-b7a61c0a0b3d';

  it('token estável por sessão e diferente entre sessões', () => {
    expect(csrfTokenFor(sessionId, keys.csrfKey)).toBe(csrfTokenFor(sessionId, keys.csrfKey));
    expect(csrfTokenFor(sessionId, keys.csrfKey)).not.toBe(
      csrfTokenFor('01a0f904-550e-7054-ac7c-b7a61c0a0b3e', keys.csrfKey),
    );
  });

  it('aceita o token correto e rejeita alterado, de outra chave ou ausente', () => {
    const token = csrfTokenFor(sessionId, keys.csrfKey);
    expect(isValidCsrfToken(token, sessionId, keys.csrfKey)).toBe(true);
    expect(isValidCsrfToken(token.slice(0, -1) + 'x', sessionId, keys.csrfKey)).toBe(false);
    expect(
      isValidCsrfToken(
        csrfTokenFor(sessionId, deriveAuthKeys(randomBytes(32).toString('base64url')).csrfKey),
        sessionId,
        keys.csrfKey,
      ),
    ).toBe(false);
    expect(isValidCsrfToken(undefined, sessionId, keys.csrfKey)).toBe(false);
    expect(isValidCsrfToken('', sessionId, keys.csrfKey)).toBe(false);
  });
});

describe('identificador de login (§4.4)', () => {
  it('HMAC de 32 bytes, igual para o mesmo e-mail normalizado', () => {
    const a = loginIdentifierHash('ana@x.com', keys.identifierKey);
    expect(a).toHaveLength(32);
    expect(loginIdentifierHash('ana@x.com', keys.identifierKey)).toEqual(a);
    expect(loginIdentifierHash('bia@x.com', keys.identifierKey)).not.toEqual(a);
  });

  it('chaves CSRF e de identificador são independentes', () => {
    expect(keys.csrfKey.equals(keys.identifierKey)).toBe(false);
  });
});
