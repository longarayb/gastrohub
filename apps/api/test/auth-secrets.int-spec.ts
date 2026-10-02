import { createHash } from 'node:crypto';

import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BrowserClient,
  createUser,
  LogCapture,
  startAuthApp,
  withUserAdmin,
} from './support/auth-kit.ts';
import { testOwnerUrl, withClient } from './support/test-database.ts';

const NEW_PASSWORD = 'nova frase secreta 2026';

// M02 §4.5, §9.3, §9.7: segredos nunca armazenados nem logados.
describe('segredos fora do banco e dos logs', () => {
  let app: NestFastifyApplication;
  const logs = new LogCapture();

  beforeAll(async () => {
    app = await startAuthApp({ LOG_LEVEL: 'trace' }, { logDestination: logs });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('token irrecuperável: nenhuma coluna contém o cookie nem o CSRF; token_hash = SHA-256(cookie)', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    const login = await client.login(user.email, user.password);
    const sessionId = (login.body as { session: { id: string } }).session.id;
    const cookie = client.cookie!;
    const csrf = client.csrfToken!;

    const dump = await withClient(testOwnerUrl(), async (db) => {
      const tables = ['users', 'sessions', 'auth_events'];
      const parts: string[] = [];
      for (const table of tables) {
        const { rows } = await db.query(`SELECT t::text AS row FROM ${table} t`);
        parts.push(...rows.map((r) => r.row as string));
      }
      const { rows } = await db.query('SELECT token_hash FROM sessions WHERE id = $1', [sessionId]);
      return { text: parts.join('\n'), tokenHash: rows[0]?.token_hash as Buffer };
    });

    const raw = Buffer.from(cookie, 'base64url');
    for (const secret of [cookie, csrf, raw.toString('hex'), user.password]) {
      expect(dump.text).not.toContain(secret);
    }
    expect(dump.tokenHash).toEqual(createHash('sha256').update(raw).digest());
  });

  it('auth_events registra todos os tipos de evento da §4.4', async () => {
    const user = await createUser();
    const laptop = new BrowserClient(app);
    const phone = new BrowserClient(app);
    const tablet = new BrowserClient(app);
    await new BrowserClient(app).login(user.email, 'senha errada de teste'); // login_failed
    await laptop.login(user.email, user.password); // login_succeeded
    const phoneLogin = await phone.login(user.email, user.password);
    await tablet.login(user.email, user.password);
    const phoneId = (phoneLogin.body as { session: { id: string } }).session.id;
    await laptop.delete(`/api/v1/auth/sessions/${phoneId}`); // session_revoked
    await laptop.post('/api/v1/auth/sessions/revoke-others'); // sessions_revoked_others
    await laptop.post('/api/v1/auth/password', {
      currentPassword: 'errada errada errada',
      newPassword: NEW_PASSWORD,
    }); // password_change_failed
    await laptop.post('/api/v1/auth/password', {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    }); // password_changed
    await laptop.post('/api/v1/auth/logout'); // logout
    await withUserAdmin(async (admin) => {
      await admin.disable(user.email); // user_disabled
      await admin.enable(user.email); // user_enabled
      await admin.setPassword(user.email, 'senha do operador 2026'); // password_set_by_operator
    });

    const types = await withClient(testOwnerUrl(), async (db) => {
      const { rows } = await db.query<{ event_type: string }>(
        'SELECT DISTINCT event_type FROM auth_events WHERE user_id = $1',
        [user.id],
      );
      return rows.map((r) => r.event_type).sort();
    });
    // login_rate_limited é coberto em auth-rate-limit.int-spec.ts (registrado por identifier_hash).
    expect(types).toEqual(
      [
        'login_failed',
        'login_succeeded',
        'logout',
        'password_change_failed',
        'password_changed',
        'password_set_by_operator',
        'session_revoked',
        'sessions_revoked_others',
        'user_created',
        'user_disabled',
        'user_enabled',
      ].sort(),
    );
  });

  it('logs de login, troca de senha e logout não contêm senha, token nem CSRF', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    await client.login(user.email, user.password);
    const firstCookie = client.cookie!;
    const firstCsrf = client.csrfToken!;
    await client.post('/api/v1/auth/password', {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });
    const secondCookie = client.cookie!;
    const secondCsrf = client.csrfToken!;
    await client.post('/api/v1/auth/logout');
    await new BrowserClient(app).login(user.email, 'senha errada de teste');

    const text = logs.text;
    expect(text).toContain('login_succeeded'); // a captura está funcionando
    expect(text).toContain('password_changed');
    for (const secret of [
      user.password,
      NEW_PASSWORD,
      'senha errada de teste',
      firstCookie,
      secondCookie,
      firstCsrf,
      secondCsrf,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain(user.email);
  });
});
