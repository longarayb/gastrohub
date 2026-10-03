import { describe, expect, it } from 'vitest';

import { currentSessionSchema } from './auth.js';
import { branchSchema, switchActiveCompanyRequestSchema } from './organization.js';

describe('organization contracts', () => {
  it('troca de empresa exige UUID e rejeita campos extras', () => {
    expect(switchActiveCompanyRequestSchema.safeParse({ companyId: 'x' }).success).toBe(false);
    expect(
      switchActiveCompanyRequestSchema.safeParse({
        companyId: '01a0f904-550e-7054-ac7c-b7a61c0a0b3d',
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it('sessão aceita activeCompany nulo ou preenchido', () => {
    const base = {
      user: { id: '01a0f904-550e-7054-ac7c-b7a61c0a0b3d', email: 'a@b.co', name: 'A' },
      session: {
        id: '01a0f904-550e-7054-ac7c-b7a61c0a0b3e',
        createdAt: '2026-10-03T12:00:00.000Z',
        expiresAt: '2026-10-10T12:00:00.000Z',
        idleExpiresAt: '2026-10-04T00:00:00.000Z',
      },
      csrfToken: 't',
    };
    expect(currentSessionSchema.safeParse({ ...base, activeCompany: null }).success).toBe(true);
    expect(
      currentSessionSchema.safeParse({
        ...base,
        activeCompany: { id: '01a0f904-550e-7054-ac7c-b7a61c0a0b3f', tradeName: 'Burger' },
      }).success,
    ).toBe(true);
  });

  it('filial exige virada do dia em HH:MM', () => {
    const branch = {
      id: '01a0f904-550e-7054-ac7c-b7a61c0a0b3d',
      name: 'Centro',
      taxId: null,
      timezone: 'America/Sao_Paulo',
      businessDayCutoff: '04:00',
      address: {
        postalCode: null,
        street: null,
        number: null,
        complement: null,
        district: null,
        city: null,
        state: null,
      },
      status: 'active',
    };
    expect(branchSchema.safeParse(branch).success).toBe(true);
    expect(branchSchema.safeParse({ ...branch, businessDayCutoff: '4h' }).success).toBe(false);
  });
});
