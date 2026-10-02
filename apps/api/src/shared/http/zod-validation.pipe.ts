import { type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';

import { ApiException } from './api-exception.js';

/**
 * Valida body, query ou params com um schema zod. Mensagens nunca ecoam os valores recebidos.
 * Uso: `@Body(new ZodValidationPipe(schema))`.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException(
        400,
        'validation_failed',
        'Um ou mais campos são inválidos.',
        result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(corpo)',
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
