import { type IncomingMessage } from 'node:http';
import { type Http2ServerRequest } from 'node:http2';

import fastifyCookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule, type AppModuleOptions } from './app.module.js';
import { type AppConfig } from './shared/config/config.schema.js';
import { ApiException } from './shared/http/api-exception.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './shared/http/request-id.js';

/** Rotas de negócio ficam sob /api/v1; health fica fora do prefixo (docs/04-API.md). */
export const API_PREFIX = 'api/v1';
export const API_DOCS_PATH = 'api/docs';

/** Limite global por IP, em memória (M02 §9.5). */
export const GLOBAL_RATE_LIMIT = { max: 300, timeWindow: '1 minute' } as const;

// A API só serve JSON: CSP mais restritiva possível.
const STRICT_CSP = {
  directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
};
// O Swagger UI (apenas fora de produção) precisa de scripts e estilos inline.
const SWAGGER_CSP = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    frameAncestors: ["'none'"],
    // Em http://localhost, forçar https quebraria o carregamento dos assets do Swagger UI.
    upgradeInsecureRequests: null,
  },
};

/** Opções usadas somente por testes (módulos extras, destino de log). */
export type CreateAppOptions = AppModuleOptions;

export async function createApp(
  config: AppConfig,
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const docsEnabled = config.NODE_ENV !== 'production';

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, options),
    new FastifyAdapter({
      // Número de proxies confiáveis (D11): define request.ip para rate limit e auth_events.
      // Forma de função equivalente a "confiar nos N primeiros saltos".
      trustProxy:
        config.TRUST_PROXY === false
          ? false
          : (_address: string, hop: number) => hop < (config.TRUST_PROXY as number),
      // O header do cliente não é aceito cegamente: resolveRequestId valida o formato.
      requestIdHeader: false,
      genReqId: (req: IncomingMessage | Http2ServerRequest) =>
        resolveRequestId(req.headers[REQUEST_ID_HEADER]),
    }),
    // abortOnError: false → falhas de inicialização chegam ao chamador (main.ts encerra com código 1).
    // bodyParser: false → o Nest não registra parsers extras (ex.: formulário urlencoded); fica
    // só o parser JSON do Fastify (CSRF camada 2, M02 §9.4).
    { bufferLogs: true, abortOnError: false, bodyParser: false },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (request, reply, done) => {
    void reply.header('X-Request-Id', request.id);
    done();
  });
  // Somente JSON no corpo (CSRF camada 2, M02 §9.4): text/plain passa a receber 415.
  fastify.removeContentTypeParser('text/plain');

  await app.register(helmet, {
    contentSecurityPolicy: docsEnabled ? SWAGGER_CSP : STRICT_CSP,
  });
  await app.register(fastifyCookie);
  await app.register(rateLimit, {
    ...GLOBAL_RATE_LIMIT,
    allowList: (request) => request.url.startsWith('/health/'),
    // Mesmo formato dos demais 429 (Problem Details com code e Retry-After), via filtro global.
    errorResponseBuilder: (_request, context) =>
      Object.assign(
        new ApiException(
          429,
          'rate_limited',
          'Muitas requisições. Tente novamente mais tarde.',
          undefined,
          { 'Retry-After': String(Math.max(1, Math.ceil(context.ttl / 1000))) },
        ),
        { statusCode: 429 },
      ),
  });
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  if (docsEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('GastroHub API')
        .setDescription('API do GastroHub. Documentação disponível apenas fora de produção.')
        .setVersion('0.0.0')
        .build(),
    );
    SwaggerModule.setup(API_DOCS_PATH, app, document);
  }

  return app;
}
