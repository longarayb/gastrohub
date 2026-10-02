import { loginResponseSchema, PROBLEM_DETAILS_CONTENT_TYPE } from '@gastrohub/contracts';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PasswordHasher } from '../src/modules/identity/infrastructure/password-hasher.js';
import {
  BrowserClient,
  createUser,
  LogCapture,
  problemWithoutRequestId,
  SECURE_COOKIE,
  sessionSetCookie,
  startAuthApp,
  STRONG_PASSWORD,
  uniqueEmail,
  withUserAdmin,
} from './support/auth-kit.ts';
import { testOwnerUrl, withClient } from './support/test-database.ts';

const GENERIC_401 = {
  type: 'about:blank',
  title: 'Não autenticado',
  status: 401,
  detail:
    'E-mail ou senha inválidos. Após várias tentativas, aguarde alguns minutos antes de tentar novamente.',
  instance: '/api/v1/auth/login',
  code: 'invalid_credentials',
};

async function events(userIdOrNull: string | null, sessionId?: string) {
  return withClient(testOwnerUrl(), async (client) => {
    const { rows } = await client.query<{ event_type: string; details: Record<string, unknown> }>(
      sessionId
        ? 'SELECT event_type, details FROM auth_events WHERE session_id = $1 ORDER BY occurred_at'
        : 'SELECT event_type, details FROM auth_events WHERE user_id = $1 ORDER BY occurred_at',
      [sessionId ?? userIdOrNull],
    );
    return rows;
  });
}

describe('login (§6.1, §7.3)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startAuthApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('senha correta: 200, cookie seguro, csrfToken, sessão e evento login_succeeded', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    const response = await client.login(user.email.toUpperCase(), user.password);

    expect(response.status).toBe(200);
    const body = loginResponseSchema.parse(response.body);
    expect(body.user).toEqual({ id: user.id, email: user.email, name: user.name });
    expect(body.csrfToken.length).toBeGreaterThan(20);
    expect(JSON.stringify(response.body)).not.toContain(client.cookie);

    const setCookie = sessionSetCookie(response)!;
    expect(setCookie).toMatch(new RegExp(`^${SECURE_COOKIE}=[A-Za-z0-9_-]{43};`));
    expect(setCookie).toMatch(/; HttpOnly/);
    expect(setCookie).toMatch(/; Secure/);
    expect(setCookie).toMatch(/; SameSite=Lax/);
    expect(setCookie).toMatch(/; Path=\//);
    expect(setCookie).not.toMatch(/Domain=/i);
    const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1]);
    expect(maxAge).toBeGreaterThan(168 * 3600 - 60);
    expect(maxAge).toBeLessThanOrEqual(168 * 3600);

    const types = (await events(null, body.session.id)).map((e) => e.event_type);
    expect(types).toContain('login_succeeded');
  });

  it('senha incorreta: 401 genérico, sem cookie, evento login_failed (wrong_password)', async () => {
    const user = await createUser();
    const response = await new BrowserClient(app).login(user.email, 'senha errada qualquer');
    expect(response.status).toBe(401);
    expect(problemWithoutRequestId(response)).toEqual(GENERIC_401);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(sessionSetCookie(response)).toBeUndefined();
    const failed = (await events(user.id)).filter((e) => e.event_type === 'login_failed');
    expect(failed.at(-1)?.details).toEqual({ reason: 'wrong_password' });
  });

  it('usuário inexistente: resposta idêntica à de senha errada, com Argon2id executado', async () => {
    const user = await createUser();
    const wrong = await new BrowserClient(app).login(user.email, 'senha errada qualquer');

    const verify = vi.spyOn(PasswordHasher.prototype, 'verify');
    const unknown = await new BrowserClient(app).login(
      uniqueEmail('ghost'),
      'senha errada qualquer',
    );

    expect(unknown.status).toBe(wrong.status);
    expect(problemWithoutRequestId(unknown)).toEqual(problemWithoutRequestId(wrong));
    expect(unknown.headers['content-type']).toBe(wrong.headers['content-type']);
    expect(sessionSetCookie(unknown)).toBeUndefined();
    expect(verify).toHaveBeenCalledTimes(1); // hash fictício
  });

  it('usuário desativado: resposta idêntica, mesmo com a senha correta', async () => {
    const user = await createUser();
    await withUserAdmin((admin) => admin.disable(user.email));
    const response = await new BrowserClient(app).login(user.email, user.password);
    expect(problemWithoutRequestId(response)).toEqual(GENERIC_401);
    const failed = (await events(user.id)).filter((e) => e.event_type === 'login_failed');
    expect(failed.at(-1)?.details).toEqual({ reason: 'user_disabled' });
  });

  it('corpo inválido: 400 validation_failed sem ecoar a senha', async () => {
    const response = await new BrowserClient(app).login('nao-e-email', 'segredo-123456');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'validation_failed' });
    expect(JSON.stringify(response.body)).not.toContain('segredo-123456');
  });

  it('login com cookie de sessão válida: sessão anterior revogada (replaced)', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    const first = await client.login(user.email, user.password);
    const firstSessionId = (first.body as { session: { id: string } }).session.id;
    const firstCookie = client.cookie;

    const second = await client.login(user.email, user.password);
    expect(second.status).toBe(200);
    expect(client.cookie).not.toBe(firstCookie);

    const reason = await withClient(testOwnerUrl(), async (db) => {
      const { rows } = await db.query('SELECT revoked_reason FROM sessions WHERE id = $1', [
        firstSessionId,
      ]);
      return rows[0]?.revoked_reason;
    });
    expect(reason).toBe('replaced');
  });

  it('senha nunca em texto: password_hash argon2id sem a senha', async () => {
    const user = await createUser();
    const hash = await withClient(testOwnerUrl(), async (db) => {
      const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
      return rows[0]?.password_hash as string;
    });
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain(STRONG_PASSWORD);
  });
});

describe('cookie em desenvolvimento (D10)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startAuthApp(
      { NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'false' },
      { logDestination: new LogCapture() },
    );
  });
  afterAll(async () => {
    await app?.close();
  });

  it('usa gh_session sem Secure (HTTP local), mantendo HttpOnly e SameSite=Lax', async () => {
    const user = await createUser();
    const client = new BrowserClient(app, undefined, 'gh_session');
    const response = await client.login(user.email, user.password);
    const setCookie = sessionSetCookie(response, 'gh_session')!;
    expect(setCookie).toBeDefined();
    expect(setCookie).not.toMatch(/; Secure/);
    expect(setCookie).toMatch(/; HttpOnly/);
    expect(setCookie).toMatch(/; SameSite=Lax/);
    expect(sessionSetCookie(response, SECURE_COOKIE)).toBeUndefined();
  });
});
