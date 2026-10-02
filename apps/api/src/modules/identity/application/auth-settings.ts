import { type AppConfig } from '../../../shared/config/config.schema.js';
import { type AuthKeys, deriveAuthKeys } from '../infrastructure/crypto.js';

export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');

export interface AuthSettings {
  idleTtlMinutes: number;
  idleTtlMs: number;
  absoluteTtlHours: number;
  /** `__Host-gh_session` (Secure) fora de desenvolvimento; `gh_session` em dev (D10). */
  cookieName: string;
  cookieSecure: boolean;
  allowedOrigins: readonly string[];
  keys: AuthKeys;
}

export const SECURE_COOKIE_NAME = '__Host-gh_session';
export const DEV_COOKIE_NAME = 'gh_session';

export function authSettingsFrom(config: AppConfig): AuthSettings {
  return {
    idleTtlMinutes: config.SESSION_IDLE_TTL_MINUTES,
    idleTtlMs: config.SESSION_IDLE_TTL_MINUTES * 60_000,
    absoluteTtlHours: config.SESSION_ABSOLUTE_TTL_HOURS,
    cookieName: config.SESSION_COOKIE_SECURE ? SECURE_COOKIE_NAME : DEV_COOKIE_NAME,
    cookieSecure: config.SESSION_COOKIE_SECURE,
    allowedOrigins: config.CORS_ORIGINS,
    keys: deriveAuthKeys(config.AUTH_SECRET),
  };
}
