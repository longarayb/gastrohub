import { PROBLEM_DETAILS_CONTENT_TYPE, type ProblemDetails } from '@gastrohub/contracts';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { ApiException } from './api-exception.js';

const TITLES: Partial<Record<number, string>> = {
  400: 'Requisição inválida',
  401: 'Não autenticado',
  403: 'Acesso negado',
  404: 'Recurso não encontrado',
  405: 'Método não permitido',
  409: 'Conflito',
  413: 'Conteúdo muito grande',
  415: 'Tipo de conteúdo não suportado',
  422: 'Regra de negócio violada',
  429: 'Muitas requisições',
  500: 'Erro interno',
  503: 'Serviço indisponível',
};

/**
 * Converte qualquer exceção em Problem Details (RFC 9457). Nunca expõe stack trace,
 * SQL ou detalhes internos de erros não tratados. Ver docs/04-API.md §4.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const problem = toProblemDetails(exception, request);
    if (problem.status >= 500) {
      this.logger.error(
        { err: exception, requestId: problem.requestId },
        `Falha não tratada em ${request.method} ${problem.instance}`,
      );
    }

    if (exception instanceof ApiException && exception.headers) {
      void reply.headers(exception.headers);
    }
    void reply
      .status(problem.status)
      .header('content-type', PROBLEM_DETAILS_CONTENT_TYPE)
      .send(problem);
  }
}

export function toProblemDetails(exception: unknown, request: FastifyRequest): ProblemDetails {
  const status = statusOf(exception);
  const title = TITLES[status] ?? (status >= 500 ? 'Erro interno' : 'Erro na requisição');

  // Mensagens de HttpException são escritas pela aplicação e podem ser expostas (4xx e 503).
  // Erros inesperados (500) nunca têm detalhes expostos.
  const detail =
    exception instanceof HttpException &&
    (status < 500 || status === HttpStatus.SERVICE_UNAVAILABLE)
      ? httpExceptionMessage(exception)
      : undefined;

  const extra =
    exception instanceof ApiException
      ? {
          code: exception.code,
          ...(exception.errors?.length ? { errors: exception.errors } : {}),
        }
      : {};

  return {
    type: 'about:blank',
    title,
    status,
    ...(detail ? { detail } : {}),
    instance: request.url.split('?')[0] ?? request.url,
    ...(request.id ? { requestId: request.id } : {}),
    ...extra,
  };
}

/** HttpException do Nest, erros do próprio Fastify (ex.: 415) ou 500 para o resto. */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  const fastifyStatus = (exception as { statusCode?: unknown } | null)?.statusCode;
  if (typeof fastifyStatus === 'number' && fastifyStatus >= 400 && fastifyStatus < 500) {
    return fastifyStatus;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function httpExceptionMessage(exception: HttpException): string | undefined {
  if (exception instanceof ApiException) return exception.detail;
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object' && 'message' in response) {
    const message = (response as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return undefined;
}
