import { passwordChangedResponseSchema } from '@gastrohub/contracts';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BrowserClient, createUser, startAuthApp } from './support/auth-kit.ts';
import { testOwnerUrl, withClient } from './support/test-database.ts';

const NEW_PASSWORD = 'outra frase segura 2026';

// M02 §6.6.
describe('troca de senha', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startAuthApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('sucesso: rotaciona o cookie, revoga todas as outras sessões e a antiga do próprio dispositivo', async () => {
    const user = await createUser();
    const laptop = new BrowserClient(app);
    const phone = new BrowserClient(app);
    await laptop.login(user.email, user.password);
    await phone.login(user.email, user.password);
    const oldCookie = laptop.cookie;
    const oldCsrf = laptop.csrfToken;

    const response = await laptop.post('/api/v1/auth/password', {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });
    expect(response.status).toBe(200);
    const body = passwordChangedResponseSchema.parse(response.body);
    expect(laptop.cookie).not.toBe(oldCookie);
    expect(body.csrfToken).not.toBe(oldCsrf);

    expect((await laptop.get('/api/v1/auth/session')).status).toBe(200);
    expect((await phone.get('/api/v1/auth/session')).body).toMatchObject({
      code: 'session_revoked',
    });
    const stale = new BrowserClient(app);
    stale.cookie = oldCookie;
    expect((await stale.get('/api/v1/auth/session')).status).toBe(401);

    expect((await new BrowserClient(app).login(user.email, NEW_PASSWORD)).status).toBe(200);
    expect((await new BrowserClient(app).login(user.email, user.password)).status).toBe(401);

    const events = await withClient(testOwnerUrl(), async (db) => {
      const { rows } = await db.query(
        `SELECT event_type FROM auth_events WHERE user_id = $1 AND event_type = 'password_changed'`,
        [user.id],
      );
      return rows;
    });
    expect(events).toHaveLength(1);
  });

  it('senha atual incorreta: 400 invalid_current_password, sessão mantida, evento registrado', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    await client.login(user.email, user.password);
    const response = await client.post('/api/v1/auth/password', {
      currentPassword: 'senha atual errada',
      newPassword: NEW_PASSWORD,
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'invalid_current_password' });
    expect((await client.get('/api/v1/auth/session')).status).toBe(200);

    const [row] = await withClient(testOwnerUrl(), async (db) => {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM auth_events
          WHERE user_id = $1 AND event_type = 'password_change_failed' AND identifier_hash IS NOT NULL`,
        [user.id],
      );
      return rows;
    });
    expect(row.n).toBe(1);
  });

  it('política violada: 400 validation_failed com errors em newPassword', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    await client.login(user.email, user.password);
    const response = await client.post('/api/v1/auth/password', {
      currentPassword: user.password,
      newPassword: 'curta',
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'validation_failed',
      errors: [{ field: 'newPassword' }],
    });
  });

  it('nova senha igual à atual: 400 password_reused', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    await client.login(user.email, user.password);
    const response = await client.post('/api/v1/auth/password', {
      currentPassword: user.password,
      newPassword: user.password,
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'password_reused' });
  });

  it('sem CSRF: 403; sem sessão: 401', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    await client.login(user.email, user.password);
    const body = { currentPassword: user.password, newPassword: NEW_PASSWORD };
    expect((await client.post('/api/v1/auth/password', body, false)).status).toBe(403);
    expect((await new BrowserClient(app).post('/api/v1/auth/password', body)).status).toBe(401);
  });
});
