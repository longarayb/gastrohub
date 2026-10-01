import { type IncomingMessage } from 'node:http';
import { type Http2ServerRequest } from 'node:http2';

import helmet from '@fastify/helmet';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { type AppConfig } from './shared/config/config.schema.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './shared/http/request-id.js';

/** Rotas de negócio ficam sob /api/v1; health fica fora do prefixo (docs/04-API.md). */
export const API_PREFIX = 'api/v1';
export const API_DOCS_PATH = 'api/docs';

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

export async function createApp(config: AppConfig): Promise<NestFastifyApplication> {
  const docsEnabled = config.NODE_ENV !== 'production';

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config),
    new FastifyAdapter({
      trustProxy: false,
      // O header do cliente não é aceito cegamente: resolveRequestId valida o formato.
      requestIdHeader: false,
      genReqId: (req: IncomingMessage | Http2ServerRequest) =>
        resolveRequestId(req.headers[REQUEST_ID_HEADER]),
    }),
    // abortOnError: false → falhas de inicialização chegam ao chamador (main.ts encerra com código 1).
    { bufferLogs: true, abortOnError: false },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      void reply.header('X-Request-Id', request.id);
      done();
    });

  await app.register(helmet, {
    contentSecurityPolicy: docsEnabled ? SWAGGER_CSP : STRICT_CSP,
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
