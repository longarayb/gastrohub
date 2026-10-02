import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { normalizeEmail } from '../src/modules/identity/domain/email.js';
import {
  deriveAuthKeys,
  loginIdentifierHash,
} from '../src/modules/identity/infrastructure/crypto.js';
import { PasswordHasher } from '../src/modules/identity/infrastructure/password-hasher.js';
import {
  BrowserClient,
  createUser,
  problemWithoutRequestId,
  sessionSetCookie,
  startAuthApp,
  uniqueEmail,
  uniqueIp,
} from './support/auth-kit.ts';
import { testOwnerUrl, withClient } from './support/test-database.ts';

const WRONG = 'senha errada qualquer';

const identifierKey = deriveAuthKeys(process.env.AUTH_SECRET!).identifierKey;

/** Escopos registrados internamente para um e-mail (via identifier_hash) ou um IP. */
async function rateLimitedScopes(by: { email: string } | { ip: string }): Promise<string[]> {
  return withClient(testOwnerUrl(), async (db) => {
    const { rows } = await db.query<{ scope: string }>(
      `SELECT details->>'scope' AS scope FROM auth_events
        WHERE event_type = 'login_rate_limited'
          AND ${'email' in by ? 'identifier_hash = $1' : 'ip = $1::inet'}
        ORDER BY occurred_at`,
      ['email' in by ? loginIdentifierHash(normalizeEmail(by.email), identifierKey) : by.ip],
    );
    return rows.map((r) => r.scope);
  });
}

/** Cabeçalhos que poderiam revelar diferença entre respostas. */
function relevantHeaders(headers: Record<string, unknown>) {
  return {
    status: headers['status'],
    contentType: headers['content-type'],
    retryAfter: headers['retry-after'],
    setCookie: headers['set-cookie'],
  };
}

// M02 §9.5 (D4 com ajuste): bloqueio por conta nunca exposto; 429 só por IP/global.
describe('rate limiting', () => {
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

  it('conta + IP: após 5 falhas, a 6ª tentativa — mesmo com a senha correta — é idêntica a senha errada', async () => {
    const user = await createUser();
    const ip = uniqueIp();
    let wrongResponse;
    for (let i = 0; i < 5; i++)
      wrongResponse = await new BrowserClient(app, ip).login(user.email, WRONG);

    const verify = vi.spyOn(PasswordHasher.prototype, 'verify');
    const blocked = await new BrowserClient(app, ip).login(user.email, user.password);

    expect(blocked.status).toBe(401);
    expect(problemWithoutRequestId(blocked)).toEqual(problemWithoutRequestId(wrongResponse!));
    expect(relevantHeaders(blocked.headers)).toEqual(relevantHeaders(wrongResponse!.headers));
    expect(sessionSetCookie(blocked)).toBeUndefined();
    expect(verify).toHaveBeenCalledTimes(1); // Argon2id executado (hash fictício)
    expect(await rateLimitedScopes({ ip })).toContain('account_ip');

    // De outro IP, a mesma conta ainda autentica (a regra conta + IP isola o atacante).
    expect((await new BrowserClient(app).login(user.email, user.password)).status).toBe(200);
  });

  it('e-mail inexistente é bloqueado igualmente, sem revelar nada', async () => {
    const email = uniqueEmail('ghost');
    const ip = uniqueIp();
    const responses = [];
    for (let i = 0; i < 6; i++)
      responses.push(await new BrowserClient(app, ip).login(email, WRONG));
    const bodies = responses.map(problemWithoutRequestId);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(responses.every((r) => r.status === 401)).toBe(true);
    expect(await rateLimitedScopes({ ip })).toContain('account_ip');
  });

  it('login bem-sucedido zera a contagem conta + IP', async () => {
    const user = await createUser();
    const ip = uniqueIp();
    for (let i = 0; i < 4; i++) await new BrowserClient(app, ip).login(user.email, WRONG);
    expect((await new BrowserClient(app, ip).login(user.email, user.password)).status).toBe(200);
    for (let i = 0; i < 4; i++) await new BrowserClient(app, ip).login(user.email, WRONG);
    expect((await new BrowserClient(app, ip).login(user.email, user.password)).status).toBe(200);
  });

  it('conta (qualquer IP): 20 falhas distribuídas bloqueiam IPs novos sem revelar o bloqueio', async () => {
    const user = await createUser();
    for (let i = 0; i < 20; i++) await new BrowserClient(app).login(user.email, WRONG);

    const blocked = await new BrowserClient(app).login(user.email, user.password);
    expect(blocked.status).toBe(401);
    expect(blocked.body).toMatchObject({ code: 'invalid_credentials' });
    expect(await rateLimitedScopes({ email: user.email })).toContain('account');
  });

  it('mitigação de lockout: IP com login bem-sucedido recente continua entrando durante o ataque', async () => {
    const user = await createUser();
    const homeIp = uniqueIp();
    expect((await new BrowserClient(app, homeIp).login(user.email, user.password)).status).toBe(
      200,
    );

    // Ataque distribuído: 25 falhas de IPs diferentes.
    for (let i = 0; i < 25; i++) await new BrowserClient(app).login(user.email, WRONG);

    // IP novo da vítima: bloqueado (risco residual documentado).
    expect((await new BrowserClient(app).login(user.email, user.password)).status).toBe(401);
    // IP de sempre: aceito.
    expect((await new BrowserClient(app, homeIp).login(user.email, user.password)).status).toBe(
      200,
    );
  });

  it('tentativas bloqueadas não renovam o bloqueio (não contam como falha)', async () => {
    const user = await createUser();
    const ip = uniqueIp();
    for (let i = 0; i < 5; i++) await new BrowserClient(app, ip).login(user.email, WRONG);
    for (let i = 0; i < 3; i++) await new BrowserClient(app, ip).login(user.email, WRONG);
    const [row] = await withClient(testOwnerUrl(), async (db) => {
      const { rows } = await db.query(
        `SELECT count(*) FILTER (WHERE event_type = 'login_failed')::int AS failed,
                count(*) FILTER (WHERE event_type = 'login_rate_limited')::int AS limited
           FROM auth_events WHERE user_id = $1 OR (ip = $2::inet AND user_id IS NULL)`,
        [user.id, ip],
      );
      return rows;
    });
    expect(row).toEqual({ failed: 5, limited: 3 });
  });

  it('IP: 50 falhas em contas variadas → 429 genérico com Retry-After, sem Argon2id', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 50; i++)
      await new BrowserClient(app, ip).login(uniqueEmail('spray'), WRONG);

    const verify = vi.spyOn(PasswordHasher.prototype, 'verify');
    const email = uniqueEmail('alvo');
    const response = await new BrowserClient(app, ip).login(email, WRONG);
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      code: 'rate_limited',
      detail: 'Muitas requisições. Tente novamente mais tarde.',
    });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(JSON.stringify(response.body)).not.toContain(email);
    expect(verify).not.toHaveBeenCalled();
    expect(await rateLimitedScopes({ ip })).toContain('ip');
  });

  it('troca de senha com conta bloqueada: resposta idêntica a senha atual incorreta', async () => {
    const user = await createUser();
    const client = new BrowserClient(app);
    await client.login(user.email, user.password);
    const body = { currentPassword: WRONG, newPassword: 'outra frase segura 2026' };

    let wrong;
    for (let i = 0; i < 5; i++) wrong = await client.post('/api/v1/auth/password', body);
    const blocked = await client.post('/api/v1/auth/password', {
      currentPassword: user.password,
      newPassword: 'outra frase segura 2026',
    });
    expect(blocked.status).toBe(400);
    expect(problemWithoutRequestId(blocked)).toEqual(problemWithoutRequestId(wrong!));

    const operations = await withClient(testOwnerUrl(), async (db) => {
      const { rows } = await db.query(
        `SELECT details->>'operation' AS op FROM auth_events
          WHERE user_id = $1 AND event_type = 'login_rate_limited'`,
        [user.id],
      );
      return rows.map((r) => r.op);
    });
    expect(operations).toContain('password_change');
  });
});

describe('limite global por IP (300/min)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startAuthApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('a 301ª requisição no minuto recebe 429; health não é limitado', async () => {
    const client = new BrowserClient(app);
    for (let i = 0; i < 300; i++) {
      expect((await client.get('/api/v1/auth/session')).status).toBe(401);
    }
    const limited = await client.get('/api/v1/auth/session');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'rate_limited' });
    expect((await client.get('/health/live')).status).toBe(200);
  });
});
