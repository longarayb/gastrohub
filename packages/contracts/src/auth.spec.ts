import { describe, expect, it } from 'vitest';

import {
  changePasswordRequestSchema,
  loginRequestSchema,
  sessionIdParamSchema,
  sessionListItemSchema,
} from './auth.js';
import { problemDetailsSchema } from './problem-details.js';

describe('auth contracts', () => {
  it('aceita login válido', () => {
    expect(loginRequestSchema.safeParse({ email: 'ana@exemplo.com', password: 'x' }).success).toBe(
      true,
    );
  });

  it('rejeita campos desconhecidos no login', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'ana@exemplo.com', password: 'x', admin: true })
        .success,
    ).toBe(false);
  });

  it('rejeita e-mail inválido e senha vazia ou longa demais', () => {
    expect(loginRequestSchema.safeParse({ email: 'ana', password: 'x' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(257) }).success,
    ).toBe(false);
  });

  it('valida troca de senha estrita', () => {
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: 'a', newPassword: 'b' }).success,
    ).toBe(true);
    expect(changePasswordRequestSchema.safeParse({ newPassword: 'b' }).success).toBe(false);
  });

  it('exige UUID no parâmetro de sessão', () => {
    expect(sessionIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
  });

  it('aceita item de sessão com ip e user agent nulos', () => {
    expect(
      sessionListItemSchema.safeParse({
        id: '01a0f904-550e-7054-ac7c-b7a61c0a0b3d',
        createdAt: '2026-10-02T12:00:00.000Z',
        lastSeenAt: '2026-10-02T12:00:00.000Z',
        expiresAt: '2026-10-09T12:00:00.000Z',
        ip: null,
        userAgent: null,
        current: true,
      }).success,
    ).toBe(true);
  });

  it('Problem Details aceita o membro de extensão code', () => {
    expect(
      problemDetailsSchema.parse({
        type: 'about:blank',
        title: 'Não autenticado',
        status: 401,
        code: 'session_expired',
      }).code,
    ).toBe('session_expired');
  });
});
