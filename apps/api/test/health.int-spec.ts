import 'reflect-metadata';

import {
  healthLiveResponseSchema,
  healthReadyResponseSchema,
  PROBLEM_DETAILS_CONTENT_TYPE,
  problemDetailsSchema,
} from '@gastrohub/contracts';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.factory.js';
import { PG_POOL } from '../src/shared/database/database.module.js';
import { testConfig } from './support/test-database.ts';

async function startApp(overrides: Record<string, string> = {}): Promise<NestFastifyApplication> {
  const app = await createApp(testConfig(overrides));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('health checks (banco disponível)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('GET /health/live → 200', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(healthLiveResponseSchema.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('GET /health/ready → 200 consultando o banco', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(healthReadyResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
      database: 'ok',
    });
  });

  it('devolve o X-Request-Id recebido quando seguro', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'pdv-teste-1');
    expect(response.headers['x-request-id']).toBe('pdv-teste-1');
  });

  it('rota inexistente → 404 em Problem Details com request id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/inexistente').expect(404);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    const problem = problemDetailsSchema.parse(response.body);
    expect(problem).toMatchObject({ status: 404, instance: '/api/v1/inexistente' });
    expect(problem.requestId).toBe(response.headers['x-request-id']);
  });

  it('health fica fora do prefixo /api/v1', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
  });

  it('publica o OpenAPI fora de produção', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  it('aplica cabeçalhos de segurança (Helmet)', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});

describe('health checks (banco indisponível)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startApp();
    // Simula a perda do banco após a inicialização.
    await app.get<pg.Pool>(PG_POOL).end();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('GET /health/live continua 200 (não depende do banco)', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });

  it('GET /health/ready → 503 em Problem Details', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(problemDetailsSchema.parse(response.body)).toMatchObject({
      status: 503,
      title: 'Serviço indisponível',
      detail: 'Banco de dados indisponível.',
    });
  });
});

describe('modo produção', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startApp({ NODE_ENV: 'production' });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('não publica a documentação OpenAPI', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(404);
  });

  it('usa CSP restritiva', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
