import { type IncomingMessage, type ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.schema.js';

/** Campos nunca registrados em log. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
];

// Sob Fastify o middleware roda via middie, que reescreve req.url; o caminho real fica em originalUrl.
const requestPath = (req: IncomingMessage): string =>
  (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
          // O request id é gerado pelo Fastify (app.factory.ts) e reaproveitado aqui via req.id.
          autoLogging: {
            // Health checks são chamados com frequência por orquestradores.
            ignore: (req: IncomingMessage) => requestPath(req).startsWith('/health/'),
          },
          serializers: {
            res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
          },
          ...(config.NODE_ENV === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
})
export class LoggingModule {}
