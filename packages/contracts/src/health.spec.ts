import { describe, expect, it } from 'vitest';

import { healthReadyResponseSchema } from './health.js';
import { problemDetailsSchema } from './problem-details.js';

describe('contracts', () => {
  it('aceita a resposta de prontidão válida', () => {
    expect(healthReadyResponseSchema.parse({ status: 'ok', database: 'ok' })).toEqual({
      status: 'ok',
      database: 'ok',
    });
  });

  it('rejeita prontidão com banco indisponível', () => {
    expect(healthReadyResponseSchema.safeParse({ status: 'ok', database: 'down' }).success).toBe(
      false,
    );
  });

  it('valida Problem Details mínimo', () => {
    expect(
      problemDetailsSchema.safeParse({ type: 'about:blank', title: 'Erro', status: 500 }).success,
    ).toBe(true);
  });
});
