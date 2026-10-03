import { randomBytes } from 'node:crypto';

import { currentSessionSchema, sessionListSchema } from '@gastrohub/contracts';
import { Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BrowserClient,
  createUser,
  sessionSetCookie,
  startAuthApp,
  withUserAdmin,
} from './support/auth-kit.ts';
import { testOwnerUrl, withClient } from './support/test-database.ts';

// Rota de teste sem @Public(): prova que o guard global nega por padrão.
@Controller('test-guard')
class GuardProbeController {
  @Get()
  read() {
    return { ok: true };
  }

  @Post()
  @HttpCode(200)
  write() {
    return { ok: true };
  }
}

@Module({ controllers: [GuardProbeController] })
class GuardProbeModule {}

async function ownerQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return withClient(testOwnerUrl(), async (db) => (await db.query(sql, params)).rows as T[]);
}

function sessionIdOf(body: unknown): string {
  return (body as { session: { id: string } }).session.id;
}

describe('sessões (§5, §6.2–§6.7)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startAuthApp({}, { extraModules: [GuardProbeModule] });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('sessão válida: GET /auth/session devolve usuário, sessão e csrfToken', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    const login = await client.login(user.email, user.password);
    const response = await client.get('/api/v1/auth/session');
    expect(response.status).toBe(200);
    const body = currentSessionSchema.parse(response.body);
    expect(body.user.id).toBe(user.id);
    expect(body.csrfToken).toBe((login.body as { csrfToken: string }).csrfToken);
  });

  it('sem cookie em rota protegida: 401 unauthenticated', async () => {
    const response = await new BrowserClient(app).get('/api/v1/auth/session');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'unauthenticated' });
  });

  it('token inválido (formato errado ou inexistente): 401 unauthenticated e cookie limpo', async () => {
    for (const token of ['abc', randomBytes(32).toString('base64url')]) {
      const client = new BrowserClient(app);
      client.cookie = token;
      const response = await client.get('/api/v1/auth/session');
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'unauthenticated' });
      expect(sessionSetCookie(response)).toMatch(/Max-Age=0/);
    }
  });

  it('expirada por inatividade: 401 session_expired e cookie limpo', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    const sessionId = sessionIdOf((await client.login(user.email, user.password)).body);
    await ownerQuery(
      `UPDATE sessions SET last_seen_at = now() - interval '13 hours' WHERE id = $1`,
      [sessionId],
    );
    const response = await client.get('/api/v1/auth/session');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'session_expired' });
    expect(sessionSetCookie(response)).toMatch(/Max-Age=0/);
  });

  it('expirada (absoluta): 401 session_expired', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    const sessionId = sessionIdOf((await client.login(user.email, user.password)).body);
    await ownerQuery(
      `UPDATE sessions SET created_at = now() - interval '8 days',
              expires_at = now() - interval '1 hour', last_seen_at = now() WHERE id = $1`,
      [sessionId],
    );
    const response = await client.get('/api/v1/auth/session');
    expect(response.body).toMatchObject({ code: 'session_expired' });
  });

  it('atualiza last_seen_at só após 5 minutos de uso', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    const sessionId = sessionIdOf((await client.login(user.email, user.password)).body);
    await ownerQuery(
      `UPDATE sessions SET last_seen_at = now() - interval '6 minutes' WHERE id = $1`,
      [sessionId],
    );
    await client.get('/api/v1/auth/session');
    const [row] = await ownerQuery<{ age: number }>(
      `SELECT extract(epoch FROM now() - last_seen_at)::int AS age FROM sessions WHERE id = $1`,
      [sessionId],
    );
    expect(row!.age).toBeLessThan(60);
  });

  it('logout: 204, evento logout, e o mesmo cookie passa a receber 401 session_revoked', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    const sessionId = sessionIdOf((await client.login(user.email, user.password)).body);
    const oldCookie = client.cookie;

    const logout = await client.post('/api/v1/auth/logout');
    expect(logout.status).toBe(204);
    expect(sessionSetCookie(logout)).toMatch(/Max-Age=0/);

    const replay = new BrowserClient(app);
    replay.cookie = oldCookie;
    const response = await replay.get('/api/v1/auth/session');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'session_revoked' });

    const events = await ownerQuery<{ event_type: string }>(
      'SELECT event_type FROM auth_events WHERE session_id = $1',
      [sessionId],
    );
    expect(events.map((e) => e.event_type)).toContain('logout');
  });

  it('logout sem sessão é idempotente: 204', async () => {
    const response = await new BrowserClient(app).post('/api/v1/auth/logout', undefined, false);
    expect(response.status).toBe(204);
  });

  it('usuário desativado: sessões existentes passam a 401 session_revoked', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    await client.login(user.email, user.password);
    await withUserAdmin((admin) => admin.disable(user.email));
    expect((await client.get('/api/v1/auth/session')).body).toMatchObject({
      code: 'session_revoked',
    });
  });

  describe('múltiplas sessões / dispositivos (§6.7)', () => {
    it('lista as sessões ativas com a atual marcada; encerrar a outra a invalida', async () => {
      const user = await createUser();
      const laptop = new BrowserClient(app);
      const phone = new BrowserClient(app);
      const laptopId = sessionIdOf((await laptop.login(user.email, user.password)).body);
      const phoneId = sessionIdOf((await phone.login(user.email, user.password)).body);

      const list = sessionListSchema.parse((await laptop.get('/api/v1/auth/sessions')).body);
      expect(list.data.map((s) => s.id).sort()).toEqual([laptopId, phoneId].sort());
      expect(list.data.find((s) => s.current)?.id).toBe(laptopId);
      expect(list.data.find((s) => s.id === phoneId)?.ip).toBe(phone.ip);

      expect((await laptop.delete(`/api/v1/auth/sessions/${phoneId}`)).status).toBe(204);
      expect((await phone.get('/api/v1/auth/session')).body).toMatchObject({
        code: 'session_revoked',
      });
      expect((await laptop.get('/api/v1/auth/session')).status).toBe(200);
    });

    it('revoke-others encerra todas as outras e mantém a atual', async () => {
      const user = await createUser();
      const a = new BrowserClient(app);
      const b = new BrowserClient(app);
      const c = new BrowserClient(app);
      for (const client of [a, b, c]) await client.login(user.email, user.password);

      expect((await a.post('/api/v1/auth/sessions/revoke-others')).status).toBe(204);
      expect((await b.get('/api/v1/auth/session')).status).toBe(401);
      expect((await c.get('/api/v1/auth/session')).status).toBe(401);
      const list = sessionListSchema.parse((await a.get('/api/v1/auth/sessions')).body);
      expect(list.data).toHaveLength(1);
    });

    it('sessão de outro usuário, inexistente ou já encerrada: 404 sem distinguir; id inválido: 400', async () => {
      const alice = await createUser();
      const bob = await createUser();
      const aliceClient = new BrowserClient(app);
      const bobClient = new BrowserClient(app);
      await aliceClient.login(alice.email, alice.password);
      const bobSession = sessionIdOf((await bobClient.login(bob.email, bob.password)).body);

      const other = await aliceClient.delete(`/api/v1/auth/sessions/${bobSession}`);
      const missing = await aliceClient.delete(
        '/api/v1/auth/sessions/01a0f904-550e-7054-ac7c-b7a61c0a0b3d',
      );
      expect(other.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(other.body).toMatchObject({ code: 'session_not_found' });
      expect((await bobClient.get('/api/v1/auth/session')).status).toBe(200);
      expect((await aliceClient.delete('/api/v1/auth/sessions/nao-e-uuid')).status).toBe(400);
    });

    it('encerrar a própria sessão atual equivale a logout (cookie limpo)', async () => {
      const user = await createUser();
      const client = new BrowserClient(app);
      const id = sessionIdOf((await client.login(user.email, user.password)).body);
      const response = await client.delete(`/api/v1/auth/sessions/${id}`);
      expect(response.status).toBe(204);
      expect(sessionSetCookie(response)).toMatch(/Max-Age=0/);
    });

    it('o 21º login revoga a sessão mais antiga (session_limit)', async () => {
      const user = await createUser();
      const client = new BrowserClient(app);
      const first = sessionIdOf((await client.login(user.email, user.password)).body);
      for (let i = 0; i < 20; i++) {
        // Clientes distintos (sem cookie), para não acionar a rotação "replaced".
        await new BrowserClient(app, client.ip).login(user.email, user.password);
      }
      const [row] = await ownerQuery<{ revoked_reason: string }>(
        'SELECT revoked_reason FROM sessions WHERE id = $1',
        [first],
      );
      expect(row?.revoked_reason).toBe('session_limit');
      const [count] = await ownerQuery<{ n: number }>(
        'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [user.id],
      );
      expect(count?.n).toBe(20);
    });
  });

  describe('guard global (nega por padrão)', () => {
    it('rota sem @Public(): 401 sem sessão, 200 com sessão', async () => {
      expect((await new BrowserClient(app).get('/api/v1/test-guard')).status).toBe(401);
      const user = await createUser();
      const client = new BrowserClient(app);
      await client.login(user.email, user.password);
      expect((await client.get('/api/v1/test-guard')).status).toBe(200);
    });

    it('método mutável em rota protegida exige CSRF', async () => {
      const user = await createUser();
      const client = new BrowserClient(app);
      await client.login(user.email, user.password);
      expect((await client.post('/api/v1/test-guard', {}, false)).body).toMatchObject({
        code: 'csrf_failed',
      });
      expect((await client.post('/api/v1/test-guard', {})).status).toBe(200);
    });
  });
});
