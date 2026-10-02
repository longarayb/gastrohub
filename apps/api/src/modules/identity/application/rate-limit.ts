// Decisão de rate limit de login e troca de senha (M02 §9.5, D4 com ajuste).
import { type FailureCounters } from '../infrastructure/auth-events.repository.js';

export const RATE_LIMITS = {
  /** Conta + IP: 5 falhas em 15 min. */
  accountIp: { maxFailures: 5, windowMinutes: 15 },
  /** Conta (qualquer IP): 20 falhas em 60 min. Não se aplica a IP confiável. */
  account: { maxFailures: 20, windowMinutes: 60 },
  /** IP (qualquer conta): 50 falhas em 15 min. */
  ip: { maxFailures: 50, windowMinutes: 15 },
} as const;

export type RateLimitScope = 'account_ip' | 'account' | 'ip';

export type RateLimitDecision =
  | { blocked: false }
  /** Bloqueio por IP: o único escopo que o cliente percebe (429 + Retry-After). */
  | { blocked: true; scope: 'ip'; retryAfterSeconds: number }
  /** Bloqueio por conta: invisível ao cliente (resposta igual a credenciais inválidas). */
  | { blocked: true; scope: 'account_ip' | 'account' };

/** Ordem de avaliação: IP, conta + IP, conta (§9.5). */
export function decideRateLimit(counters: FailureCounters): RateLimitDecision {
  if (counters.ipFailures >= RATE_LIMITS.ip.maxFailures) {
    return { blocked: true, scope: 'ip', retryAfterSeconds: ipRetryAfterSeconds(counters) };
  }
  if (counters.accountIpFailures >= RATE_LIMITS.accountIp.maxFailures) {
    return { blocked: true, scope: 'account_ip' };
  }
  // Mitigação de lockout: a regra "conta" não vale para IP com login bem-sucedido recente.
  if (!counters.trustedIp && counters.accountFailures >= RATE_LIMITS.account.maxFailures) {
    return { blocked: true, scope: 'account' };
  }
  return { blocked: false };
}

/** Segundos até a falha mais antiga sair da janela do IP (mínimo 1). */
function ipRetryAfterSeconds(counters: FailureCounters): number {
  const windowMs = RATE_LIMITS.ip.windowMinutes * 60_000;
  if (!counters.ipOldestFailure) return RATE_LIMITS.ip.windowMinutes * 60;
  const remainingMs = counters.ipOldestFailure.getTime() + windowMs - counters.now.getTime();
  return Math.max(1, Math.ceil(remainingMs / 1000));
}
