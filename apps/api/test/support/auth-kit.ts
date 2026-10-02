import 'reflect-metadata';

import { randomBytes, randomInt } from 'node:crypto';
import { Writable } from 'node:stream';

import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request, { type Response } from 'supertest';

import { createApp, type CreateAppOptions } from '../../src/app.factory.js';
import { UserAdminService } from '../../src/modules/identity/application/user-admin.service.js';
import { AuthEventsRepository } from '../../src/modules/identity/infrastructure/auth-events.repository.js';
import { IdentityRepository } from '../../src/modules/identity/infrastructure/identity.repository.js';
import { PasswordHasher } from '../../src/modules/identity/infrastructure/password-hasher.js';
import { TEST_ORIGIN, testAppUrl, testConfig } from './test-database.ts';

export const STRONG_PASSWORD = 'frase segura de teste 2026';
export const SECURE_COOKIE = '__Host-gh_session';

/** E-mail único por execução (o banco de teste não é truncado entre execuções). */
export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomBytes(5).toString('hex')}@teste.local`;
}

/** IP único por teste, enviado em X-Forwarded-For (TRUST_PROXY=1 nos apps de teste). */
export function uniqueIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** Sobe a API de teste. TRUST_PROXY=1 permite simular IPs distintos por teste. */
export async function startAuthApp(
  overrides: Record<string, string> = {},
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const app = await createApp(testConfig({ TRUST_PROXY: '1', ...overrides }), options);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** Serviço de administração conectado ao banco de teste como gastrohub_app. */
export async function withUserAdmin<T>(fn: (admin: UserAdminService) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: testAppUrl(), max: 2 });
  try {
    const db = drizzle({ client: pool });
    return await fn(
      new UserAdminService(
        new IdentityRepository(db),
        new AuthEventsRepository(db),
        new PasswordHasher(),
      ),
    );
  } finally {
    await pool.end();
  }
}

export async function createUser(
  email = uniqueEmail(),
  password = STRONG_PASSWORD,
  name = 'Usuária Teste',
): Promise<{ id: string; email: string; password: string; name: string }> {
  const user = await withUserAdmin((admin) => admin.createUser(email, name, password));
  return { id: user.id, email: user.email, password, name };
}

/** Lê o cookie de sessão de uma resposta (valor e atributos crus). */
export function sessionSetCookie(response: Response, name = SECURE_COOKIE): string | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | string | undefined;
  const list = Array.isArray(header) ? header : header ? [header] : [];
  return list.find((cookie) => cookie.startsWith(`${name}=`));
}

export function cookieValue(setCookie: string | undefined): string | undefined {
  return setCookie?.split(';')[0]?.split('=').slice(1).join('=');
}

/**
 * Cliente de teste que simula um navegador: mantém o cookie de sessão e o token CSRF,
 * envia Origin permitida e um IP próprio (X-Forwarded-For).
 */
export class BrowserClient {
  cookie: string | undefined;
  csrfToken: string | undefined;

  constructor(
    private readonly app: NestFastifyApplication,
    readonly ip: string = uniqueIp(),
    private readonly cookieName = SECURE_COOKIE,
  ) {}

  private decorate(req: request.Test, withCsrf: boolean): request.Test {
    req.set('Origin', TEST_ORIGIN).set('X-Forwarded-For', this.ip);
    if (this.cookie) req.set('Cookie', `${this.cookieName}=${this.cookie}`);
    if (withCsrf && this.csrfToken) req.set('X-CSRF-Token', this.csrfToken);
    return req;
  }

  /** Atualiza cookie e CSRF a partir de uma resposta. */
  absorb(response: Response): Response {
    const setCookie = sessionSetCookie(response, this.cookieName);
    if (setCookie !== undefined) {
      const value = cookieValue(setCookie);
      this.cookie = value ? value : undefined;
    }
    const body = response.body as { csrfToken?: string } | undefined;
    if (body?.csrfToken) this.csrfToken = body.csrfToken;
    return response;
  }

  async login(email: string, password: string): Promise<Response> {
    const response = await this.decorate(
      request(this.app.getHttpServer()).post('/api/v1/auth/login'),
      false,
    ).send({ email, password });
    return this.absorb(response);
  }

  async get(path: string): Promise<Response> {
    return this.absorb(await this.decorate(request(this.app.getHttpServer()).get(path), false));
  }

  async post(path: string, body?: object, withCsrf = true): Promise<Response> {
    const req = this.decorate(request(this.app.getHttpServer()).post(path), withCsrf);
    return this.absorb(await (body === undefined ? req : req.send(body)));
  }

  async delete(path: string, withCsrf = true): Promise<Response> {
    return this.absorb(
      await this.decorate(request(this.app.getHttpServer()).delete(path), withCsrf),
    );
  }
}

/** Captura os logs (pino) de um app de teste. */
export class LogCapture extends Writable {
  readonly chunks: string[] = [];

  override _write(chunk: Buffer, _enc: BufferEncoding, done: () => void): void {
    this.chunks.push(chunk.toString('utf8'));
    done();
  }

  get text(): string {
    return this.chunks.join('');
  }
}

/** Corpo de Problem Details sem o requestId (que difere entre requisições). */
export function problemWithoutRequestId(response: Response): Record<string, unknown> {
  const { requestId: _requestId, ...rest } = response.body as Record<string, unknown>;
  return rest;
}
