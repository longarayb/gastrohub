// Tokens de sessão, CSRF e identificador de login (docs/modules/M02-autenticacao.md §3, §9.4, §9.10).
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_TOKEN_BYTES = 32;

export interface SessionToken {
  /** Valor enviado no cookie (base64url, 43 caracteres). Nunca gravado nem logado. */
  token: string;
  /** SHA-256 do token (32 bytes): o único valor gravado no banco. */
  hash: Buffer;
}

export function generateSessionToken(): SessionToken {
  const raw = randomBytes(SESSION_TOKEN_BYTES);
  return { token: raw.toString('base64url'), hash: sha256(raw) };
}

/** Hash do token recebido no cookie, ou null se o formato for inválido (≠ 32 bytes). */
export function hashSessionToken(token: string | undefined): Buffer | null {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const raw = Buffer.from(token, 'base64url');
  return raw.length === SESSION_TOKEN_BYTES ? sha256(raw) : null;
}

function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

export interface AuthKeys {
  csrfKey: Buffer;
  identifierKey: Buffer;
}

/** Chaves derivadas do AUTH_SECRET por HKDF-SHA256 (§9.10). */
export function deriveAuthKeys(authSecret: string): AuthKeys {
  const ikm = Buffer.from(authSecret, 'base64url');
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), info, 32));
  return {
    csrfKey: derive('gastrohub/csrf/v1'),
    identifierKey: derive('gastrohub/login-identifier/v1'),
  };
}

/** Token CSRF derivado do id da sessão (não armazenado; §9.4). */
export function csrfTokenFor(sessionId: string, csrfKey: Buffer): string {
  return createHmac('sha256', csrfKey).update(sessionId).digest('base64url');
}

/** Comparação em tempo constante do token CSRF recebido. */
export function isValidCsrfToken(
  received: string | undefined,
  sessionId: string,
  csrfKey: Buffer,
): boolean {
  if (!received) return false;
  const expected = Buffer.from(csrfTokenFor(sessionId, csrfKey));
  const actual = Buffer.from(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** HMAC-SHA256 do e-mail normalizado: conta tentativas sem gravar o e-mail digitado (§4.4). */
export function loginIdentifierHash(normalizedEmail: string, identifierKey: Buffer): Buffer {
  return createHmac('sha256', identifierKey).update(normalizedEmail).digest();
}
