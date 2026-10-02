import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BrowserClient,
  createUser,
  SECURE_COOKIE,
  startAuthApp,
  uniqueIp,
} from './support/auth-kit.ts';
import { TEST_ORIGIN } from './support/test-database.ts';

// M02 §9.4: origem, JSON obrigatório e token sincronizador.
describe('CSRF e origem', () => {
  let app: NestFastifyApplication;
  let client: BrowserClient;
  let other: BrowserClient;

  beforeAll(async () => {
    app = await startAuthApp();
    const user = await createUser();
    client = new BrowserClient(app);
    other = new BrowserClient(app);
    await client.login(user.email, user.password);
    await other.login(user.email, user.password);
  });
  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('rota mutável sem X-CSRF-Token: 403 csrf_failed', async () => {
    const response = await client.post('/api/v1/auth/sessions/revoke-others', undefined, false);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'csrf_failed' });
  });

  it('token CSRF de outra sessão: 403', async () => {
    const response = await http()
      .post('/api/v1/auth/sessions/revoke-others')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', client.ip)
      .set('Cookie', `${SECURE_COOKIE}=${client.cookie}`)
      .set('X-CSRF-Token', other.csrfToken!);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'csrf_failed' });
  });

  it('origem não permitida: 403 origin_not_allowed (inclusive no login)', async () => {
    const authenticated = await http()
      .post('/api/v1/auth/sessions/revoke-others')
      .set('Origin', 'https://evil.example')
      .set('Cookie', `${SECURE_COOKIE}=${client.cookie}`)
      .set('X-CSRF-Token', client.csrfToken!);
    expect(authenticated.status).toBe(403);
    expect(authenticated.body).toMatchObject({ code: 'origin_not_allowed' });

    const login = await http()
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.co', password: 'x' });
    expect(login.status).toBe(403);
    expect(login.body).toMatchObject({ code: 'origin_not_allowed' });
  });

  it('sem Origin e sem Sec-Fetch-Site: 403; com Sec-Fetch-Site same-origin: aceito', async () => {
    const without = await http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', uniqueIp())
      .send({ email: 'a@b.co', password: 'x' });
    expect(without.status).toBe(403);
    expect(without.body).toMatchObject({ code: 'origin_not_allowed' });

    const sameOrigin = await http()
      .post('/api/v1/auth/login')
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Forwarded-For', uniqueIp())
      .send({ email: 'ninguem@teste.local', password: 'x' });
    expect(sameOrigin.status).toBe(401);
  });

  it('Content-Type text/plain: 415 em Problem Details', async () => {
    const response = await http()
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'text/plain')
      .send('{"email":"a@b.co","password":"x"}');
    expect(response.status).toBe(415);
    expect(response.body).toMatchObject({ status: 415 });
  });

  it('formulário HTML (application/x-www-form-urlencoded): 415', async () => {
    const response = await http()
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .type('form')
      .send('email=a%40b.co&password=x');
    expect(response.status).toBe(415);
  });

  it('logout com sessão válida exige CSRF', async () => {
    const response = await client.post('/api/v1/auth/logout', undefined, false);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'csrf_failed' });
    // A sessão continua válida.
    expect((await client.get('/api/v1/auth/session')).status).toBe(200);
  });

  it('GET não exige CSRF', async () => {
    expect((await client.get('/api/v1/auth/sessions')).status).toBe(200);
  });
});
