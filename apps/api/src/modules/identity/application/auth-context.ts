/** Identidade autenticada anexada à requisição (M02 §5.3). Única saída do M02 para outros módulos. */
export interface AuthContext {
  userId: string;
  sessionId: string;
}

/** Metadados da requisição usados em sessões e auth_events. */
export interface RequestMeta {
  ip: string;
  userAgent: string | null;
  requestId: string | null;
}

export const USER_AGENT_MAX_LENGTH = 512;

export function truncateUserAgent(value: string | undefined): string | null {
  if (!value) return null;
  return value.slice(0, USER_AGENT_MAX_LENGTH);
}

/** Normaliza IPv4 mapeado em IPv6 (::ffff:127.0.0.1 → 127.0.0.1). */
export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') && ip.includes('.') ? ip.slice(7) : ip;
}
