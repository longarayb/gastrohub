import { describe, expect, it } from 'vitest';

import { evaluateSession, type SessionSnapshot, shouldTouchLastSeen } from './session-validity.js';

const HOUR = 60 * 60 * 1000;
const IDLE = 12 * HOUR;
const now = new Date('2026-10-02T12:00:00Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

const base: SessionSnapshot = {
  createdAt: at(-2 * HOUR),
  lastSeenAt: at(-1 * HOUR),
  expiresAt: at(5 * 24 * HOUR),
  revokedAt: null,
  userStatus: 'active',
  passwordChangedAt: at(-10 * 24 * HOUR),
};

describe('evaluateSession (§5.2)', () => {
  it('válida', () => {
    expect(evaluateSession(base, now, IDLE)).toBe('valid');
  });

  it('revogada', () => {
    expect(evaluateSession({ ...base, revokedAt: at(-1000) }, now, IDLE)).toBe('revoked');
  });

  it('expirada (absoluta)', () => {
    expect(evaluateSession({ ...base, expiresAt: now }, now, IDLE)).toBe('expired');
  });

  it('expirada (inatividade)', () => {
    expect(evaluateSession({ ...base, lastSeenAt: at(-IDLE) }, now, IDLE)).toBe('expired');
    expect(evaluateSession({ ...base, lastSeenAt: at(-IDLE + 1000) }, now, IDLE)).toBe('valid');
  });

  it('usuário desativado → revogada', () => {
    expect(evaluateSession({ ...base, userStatus: 'disabled' }, now, IDLE)).toBe('revoked');
  });

  it('criada antes da troca de senha → revogada; criada no mesmo instante → válida', () => {
    expect(evaluateSession({ ...base, passwordChangedAt: at(-HOUR) }, now, IDLE)).toBe('revoked');
    expect(evaluateSession({ ...base, passwordChangedAt: base.createdAt }, now, IDLE)).toBe(
      'valid',
    );
  });
});

describe('shouldTouchLastSeen', () => {
  it('só atualiza após 5 minutos', () => {
    expect(shouldTouchLastSeen(at(-4 * 60 * 1000), now)).toBe(false);
    expect(shouldTouchLastSeen(at(-5 * 60 * 1000), now)).toBe(true);
  });
});
