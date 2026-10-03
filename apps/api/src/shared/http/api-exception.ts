import { HttpException } from '@nestjs/common';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Exceção HTTP com código estável (`code`, D14) e mensagem pública.
 * Convertida em Problem Details pelo ProblemDetailsFilter.
 */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    readonly detail?: string,
    readonly errors?: FieldError[],
    readonly headers?: Record<string, string>,
  ) {
    super({ message: detail, code, errors }, status);
  }
}
