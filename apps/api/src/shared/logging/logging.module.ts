import { type IncomingMessage, type ServerResponse } from 'node:http';
import { type Writable } from 'node:stream';

import { type DynamicModule, Module } from '@nestjs/common';
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
  // M02 §9.7
  'req.headers["x-csrf-token"]',
  '*.currentPassword',
  '*.newPassword',
  '*.csrfToken',
];

// Sob Fastify o middleware roda via middie, que reescreve req.url; o caminho real fica em originalUrl.
const requestPath = (req: IncomingMessage): string =>
  (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '';

@Module({})
export class LoggingModule {
  /**
   * `destination`: destino alternativo dos logs. Usado somente por testes que
   * verificam que segredos não aparecem nos logs (M02 §9.7).
   */
  static register(destination?: Writable): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [APP_CONFIG],
          useFactory: (config: AppConfig) => {
            const options = {
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
              ...(config.NODE_ENV === 'development' && !destination
                ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
                : {}),
            };
            return { pinoHttp: destination ? [options, destination] : options };
          },
        }),
      ],
    };
  }
}
