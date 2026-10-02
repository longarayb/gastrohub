import { describe, expect, it } from 'vitest';

import { type FailureCounters } from '../infrastructure/auth-events.repository.js';
import { decideRateLimit } from './rate-limit.js';

const now = new Date('2026-10-02T12:00:00Z');
const counters = (partial: Partial<FailureCounters>): FailureCounters => ({
  ipFailures: 0,
  ipOldestFailure: null,
  accountIpFailures: 0,
  accountFailures: 0,
  trustedIp: false,
  now,
  ...partial,
});

describe('decideRateLimit (§9.5)', () => {
  it('abaixo dos limites permite', () => {
    expect(
      decideRateLimit(counters({ ipFailures: 49, accountIpFailures: 4, accountFailures: 19 })),
    ).toEqual({ blocked: false });
  });

  it('conta + IP: bloqueia a partir de 5 falhas, com escopo interno', () => {
    expect(decideRateLimit(counters({ accountIpFailures: 5 }))).toEqual({
      blocked: true,
      scope: 'account_ip',
    });
  });

  it('conta: bloqueia a partir de 20 falhas', () => {
    expect(decideRateLimit(counters({ accountFailures: 20 }))).toEqual({
      blocked: true,
      scope: 'account',
    });
  });

  it('IP confiável fica isento da regra "conta" (mitigação de lockout)', () => {
    expect(decideRateLimit(counters({ accountFailures: 500, trustedIp: true }))).toEqual({
      blocked: false,
    });
  });

  it('IP confiável continua sujeito à regra conta + IP', () => {
    expect(decideRateLimit(counters({ accountIpFailures: 5, trustedIp: true }))).toMatchObject({
      scope: 'account_ip',
    });
  });

  it('IP: bloqueia a partir de 50 falhas com Retry-After até a falha mais antiga sair da janela', () => {
    const decision = decideRateLimit(
      counters({ ipFailures: 50, ipOldestFailure: new Date(now.getTime() - 10 * 60_000) }),
    );
    expect(decision).toEqual({ blocked: true, scope: 'ip', retryAfterSeconds: 300 });
  });

  it('IP tem precedência sobre as regras de conta', () => {
    expect(
      decideRateLimit(counters({ ipFailures: 50, accountIpFailures: 5, accountFailures: 20 })),
    ).toMatchObject({ scope: 'ip' });
  });

  it('Retry-After nunca é menor que 1 segundo', () => {
    const decision = decideRateLimit(
      counters({ ipFailures: 50, ipOldestFailure: new Date(now.getTime() - 15 * 60_000) }),
    );
    expect(decision).toMatchObject({ retryAfterSeconds: 1 });
  });
});
