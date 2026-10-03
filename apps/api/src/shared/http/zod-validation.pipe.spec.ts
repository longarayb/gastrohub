import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ApiException } from './api-exception.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(z.strictObject({ email: z.email() }));

describe('ZodValidationPipe', () => {
  it('devolve o valor validado', () => {
    expect(pipe.transform({ email: 'a@b.co' })).toEqual({ email: 'a@b.co' });
  });

  it('lança validation_failed com errors por campo, sem ecoar valores', () => {
    try {
      pipe.transform({ email: 'segredo-nao-ecoar', extra: 1 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      const apiError = error as ApiException;
      expect(apiError.getStatus()).toBe(400);
      expect(apiError.code).toBe('validation_failed');
      expect(apiError.errors?.map((e) => e.field)).toContain('email');
      expect(JSON.stringify(apiError.errors)).not.toContain('segredo-nao-ecoar');
    }
  });
});
