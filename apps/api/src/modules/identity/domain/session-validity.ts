// Regras de validade de sessão (docs/modules/M02-autenticacao.md §5.2 e §5.3).
// `now` deve vir do relógio do banco (mesma fonte dos timestamps gravados).

export interface SessionSnapshot {
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userStatus: string;
  passwordChangedAt: Date;
}

export type SessionValidity = 'valid' | 'revoked' | 'expired';

/** Atualiza last_seen_at no máximo a cada 5 minutos (§5.3). */
export const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export function evaluateSession(
  session: SessionSnapshot,
  now: Date,
  idleTtlMs: number,
): SessionValidity {
  if (session.revokedAt) return 'revoked';
  if (now.getTime() >= session.expiresAt.getTime()) return 'expired';
  if (now.getTime() >= session.lastSeenAt.getTime() + idleTtlMs) return 'expired';
  if (session.userStatus !== 'active') return 'revoked';
  if (session.createdAt.getTime() < session.passwordChangedAt.getTime()) return 'revoked';
  return 'valid';
}

export function idleExpiresAt(lastSeenAt: Date, idleTtlMs: number): Date {
  return new Date(lastSeenAt.getTime() + idleTtlMs);
}

export function shouldTouchLastSeen(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= LAST_SEEN_UPDATE_INTERVAL_MS;
}
