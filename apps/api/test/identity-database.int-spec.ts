import { createHash, randomBytes } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testAppUrl, testOwnerUrl, withClient } from './support/test-database.ts';

// M02 §14.3: privilégios do runtime e constraints das tabelas de identidade.
const VALID_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaA';

async function expectInsufficientPrivilege(
  client: pg.Client,
  statement: string,
  params: unknown[] = [],
) {
  await expect(client.query(statement, params)).rejects.toMatchObject({ code: '42501' });
}

async function expectCheckViolation(client: pg.Client, statement: string, params: unknown[] = []) {
  await expect(client.query(statement, params)).rejects.toMatchObject({ code: '23514' });
}

describe('tabelas de identidade (M02)', () => {
  let userId: string;
  let sessionId: string;
  let eventId: string;
  const email = `db-${randomBytes(4).toString('hex')}@teste.local`;

  beforeAll(async () => {
    await withClient(testAppUrl(), async (client) => {
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, 'Teste', $2) RETURNING id`,
        [email, VALID_HASH],
      );
      userId = user.rows[0]!.id;
      const session = await client.query<{ id: string }>(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour') RETURNING id`,
        [userId, createHash('sha256').update(randomBytes(32)).digest()],
      );
      sessionId = session.rows[0]!.id;
      const event = await client.query<{ id: string }>(
        `INSERT INTO auth_events (event_type, user_id) VALUES ('user_created', $1) RETURNING id`,
        [userId],
      );
      eventId = event.rows[0]!.id;
    });
  });

  afterAll(async () => {
    // Limpeza como owner (o runtime não tem DELETE).
    await withClient(testOwnerUrl(), async (client) => {
      await client.query('DELETE FROM auth_events WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    });
  });

  describe('privilégios do gastrohub_app (§10.1)', () => {
    it('users: SELECT, INSERT e UPDATE permitidos; DELETE negado', async () => {
      await withClient(testAppUrl(), async (client) => {
        await client.query('SELECT id FROM users WHERE id = $1', [userId]);
        await client.query('UPDATE users SET updated_at = now() WHERE id = $1', [userId]);
        await expectInsufficientPrivilege(client, 'DELETE FROM users WHERE id = $1', [userId]);
      });
    });

    it('sessions: SELECT, INSERT e UPDATE permitidos; DELETE negado', async () => {
      await withClient(testAppUrl(), async (client) => {
        await client.query('SELECT id FROM sessions WHERE id = $1', [sessionId]);
        await client.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sessionId]);
        await expectInsufficientPrivilege(client, 'DELETE FROM sessions WHERE id = $1', [
          sessionId,
        ]);
      });
    });

    it('auth_events é append-only: UPDATE e DELETE negados', async () => {
      await withClient(testAppUrl(), async (client) => {
        await client.query('SELECT id FROM auth_events WHERE id = $1', [eventId]);
        await expectInsufficientPrivilege(
          client,
          `UPDATE auth_events SET details = '{"x":1}' WHERE id = $1`,
          [eventId],
        );
        await expectInsufficientPrivilege(client, 'DELETE FROM auth_events WHERE id = $1', [
          eventId,
        ]);
      });
    });

    it('TRUNCATE e DDL nas tabelas de identidade são negados', async () => {
      await withClient(testAppUrl(), async (client) => {
        await expectInsufficientPrivilege(client, 'TRUNCATE auth_events');
        await expect(client.query('ALTER TABLE users ADD COLUMN x int')).rejects.toMatchObject({
          code: '42501',
        });
        await expect(client.query('DROP TABLE sessions')).rejects.toMatchObject({
          code: '42501',
        });
      });
    });
  });

  describe('constraints (§4)', () => {
    it('rejeita e-mail não normalizado', async () => {
      await withClient(testAppUrl(), async (client) => {
        await expectCheckViolation(
          client,
          `INSERT INTO users (email, name, password_hash) VALUES ('Maiuscula@Teste.local', 'X', $1)`,
          [VALID_HASH],
        );
        await expectCheckViolation(
          client,
          `INSERT INTO users (email, name, password_hash) VALUES (' espaco@teste.local', 'X', $1)`,
          [VALID_HASH],
        );
      });
    });

    it('rejeita e-mail duplicado', async () => {
      await withClient(testAppUrl(), async (client) => {
        await expect(
          client.query(`INSERT INTO users (email, name, password_hash) VALUES ($1, 'X', $2)`, [
            email,
            VALID_HASH,
          ]),
        ).rejects.toMatchObject({ code: '23505' });
      });
    });

    it('rejeita password_hash que não é argon2id', async () => {
      await withClient(testAppUrl(), async (client) => {
        await expectCheckViolation(
          client,
          `INSERT INTO users (email, name, password_hash) VALUES ('hash@teste.local', 'X', 'senha-em-texto')`,
        );
      });
    });

    it('rejeita token_hash com tamanho diferente de 32 bytes', async () => {
      await withClient(testAppUrl(), async (client) => {
        await expectCheckViolation(
          client,
          `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
          [userId, randomBytes(16)],
        );
      });
    });

    it('rejeita revoked_reason sem revoked_at e motivo desconhecido', async () => {
      await withClient(testAppUrl(), async (client) => {
        await expectCheckViolation(
          client,
          `UPDATE sessions SET revoked_reason = 'logout' WHERE id = $1`,
          [sessionId],
        );
        await expectCheckViolation(
          client,
          `UPDATE sessions SET revoked_at = now(), revoked_reason = 'qualquer' WHERE id = $1`,
          [sessionId],
        );
      });
    });

    it('rejeita tipo de evento desconhecido', async () => {
      await withClient(testAppUrl(), async (client) => {
        await expectCheckViolation(client, `INSERT INTO auth_events (event_type) VALUES ('hack')`);
      });
    });
  });
});
