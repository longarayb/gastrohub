import {
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { ApiException } from './api-exception.js';
import { toProblemDetails } from './problem-details.filter.js';

const request = { url: '/api/v1/recurso?x=1', id: 'req-abc', method: 'GET' } as FastifyRequest;

describe('toProblemDetails', () => {
  it('mapeia HttpException 4xx com detalhe e instância sem query string', () => {
    expect(toProblemDetails(new NotFoundException('Produto não encontrado'), request)).toEqual({
      type: 'about:blank',
      title: 'Recurso não encontrado',
      status: 404,
      detail: 'Produto não encontrado',
      instance: '/api/v1/recurso',
      requestId: 'req-abc',
    });
  });

  it('expõe a mensagem de 503 (indisponibilidade controlada)', () => {
    const problem = toProblemDetails(
      new ServiceUnavailableException('Banco de dados indisponível.'),
      request,
    );
    expect(problem).toMatchObject({ status: 503, detail: 'Banco de dados indisponível.' });
  });

  it('nunca expõe detalhes de erros inesperados', () => {
    const problem = toProblemDetails(
      new Error('relation "secret_table" does not exist at SELECT ...'),
      request,
    );
    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Erro interno',
      status: 500,
      instance: '/api/v1/recurso',
      requestId: 'req-abc',
    });
  });

  it('inclui code e errors de ApiException', () => {
    const problem = toProblemDetails(
      new ApiException(400, 'validation_failed', 'Um ou mais campos são inválidos.', [
        { field: 'email', message: 'Inválido' },
      ]),
      request,
    );
    expect(problem).toMatchObject({
      status: 400,
      code: 'validation_failed',
      detail: 'Um ou mais campos são inválidos.',
      errors: [{ field: 'email', message: 'Inválido' }],
    });
  });

  it('respeita erros 4xx gerados pelo Fastify sem expor a mensagem interna', () => {
    const fastifyError = Object.assign(new Error('Unsupported Media Type: text/plain'), {
      statusCode: 415,
    });
    const problem = toProblemDetails(fastifyError, request);
    expect(problem).toMatchObject({ status: 415, title: 'Tipo de conteúdo não suportado' });
    expect(problem.detail).toBeUndefined();
  });

  it('não expõe mensagem de InternalServerErrorException', () => {
    const problem = toProblemDetails(new InternalServerErrorException('stack interno'), request);
    expect(problem.detail).toBeUndefined();
  });
});
