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

const TITLES: Partial<Record<number, string>> = {
  400: 'Requisição inválida',
  401: 'Não autenticado',
  403: 'Acesso negado',
  404: 'Recurso não encontrado',
  405: 'Método não permitido',
  409: 'Conflito',
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

    void reply
      .status(problem.status)
      .header('content-type', PROBLEM_DETAILS_CONTENT_TYPE)
      .send(problem);
  }
}

export function toProblemDetails(exception: unknown, request: FastifyRequest): ProblemDetails {
  const status =
    exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  const title = TITLES[status] ?? (status >= 500 ? 'Erro interno' : 'Erro na requisição');

  // Mensagens de HttpException são escritas pela aplicação e podem ser expostas (4xx e 503).
  // Erros inesperados (500) nunca têm detalhes expostos.
  const detail =
    exception instanceof HttpException &&
    (status < 500 || status === HttpStatus.SERVICE_UNAVAILABLE)
      ? httpExceptionMessage(exception)
      : undefined;

  return {
    type: 'about:blank',
    title,
    status,
    ...(detail ? { detail } : {}),
    instance: request.url.split('?')[0] ?? request.url,
    ...(request.id ? { requestId: request.id } : {}),
  };
}

function httpExceptionMessage(exception: HttpException): string | undefined {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object' && 'message' in response) {
    const message = (response as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return undefined;
}
