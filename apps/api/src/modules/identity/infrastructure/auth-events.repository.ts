// auth_events: trilha de segurança append-only (M02 §4.4) e base do rate limit (§9.5).
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { type Database, DRIZZLE } from '../../../shared/database/database.module.js';
import { type Executor } from './identity.repository.js';
import { authEvents, type AuthEventType } from './schema.js';

export interface AuthEventInput {
  eventType: AuthEventType;
  userId?: string | null;
  sessionId?: string | null;
  identifierHash?: Buffer | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /** Somente metadados. Nunca senha, token, cookie, CSRF ou e-mail em texto. */
  details?: Record<string, unknown>;
}

export interface FailureCounters {
  ipFailures: number;
  ipOldestFailure: Date | null;
  accountIpFailures: number;
  accountFailures: number;
  /** Houve login_succeeded desta conta a partir deste IP nos últimos 30 dias. */
  trustedIp: boolean;
  now: Date;
}

const FAILURE_TYPES = sql`('login_failed', 'password_change_failed')`;

@Injectable()
export class AuthEventsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async record(event: AuthEventInput, db: Executor = this.db): Promise<void> {
    await db.insert(authEvents).values({
      eventType: event.eventType,
      userId: event.userId ?? null,
      sessionId: event.sessionId ?? null,
      identifierHash: event.identifierHash ?? null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      requestId: event.requestId ?? null,
      details: event.details ?? {},
    });
  }

  /**
   * Contadores de falhas para as regras de rate limit (§9.5), em uma consulta:
   * IP (15 min), conta + IP (15 min, após o último sucesso desta conta neste IP),
   * conta (60 min) e a isenção por IP confiável (sucesso nos últimos 30 dias).
   */
  async failureCounters(identifierHash: Buffer, ip: string): Promise<FailureCounters> {
    const result = await this.db.execute<{
      ip_failures: number;
      ip_oldest_failure: Date | null;
      account_ip_failures: number;
      account_failures: number;
      trusted_ip: boolean;
      now: Date;
    }>(sql`
      WITH recent AS (
        SELECT occurred_at, ip, identifier_hash
          FROM ${authEvents}
         WHERE event_type IN ${FAILURE_TYPES}
           AND occurred_at > now() - interval '60 minutes'
           AND (ip = ${ip}::inet OR identifier_hash = ${identifierHash})
      ),
      last_success AS (
        SELECT max(occurred_at) AS at
          FROM ${authEvents}
         WHERE event_type = 'login_succeeded'
           AND identifier_hash = ${identifierHash}
           AND ip = ${ip}::inet
      )
      SELECT
        (SELECT count(*) FROM recent
          WHERE ip = ${ip}::inet AND occurred_at > now() - interval '15 minutes')::int
          AS ip_failures,
        (SELECT min(occurred_at) FROM recent
          WHERE ip = ${ip}::inet AND occurred_at > now() - interval '15 minutes')
          AS ip_oldest_failure,
        (SELECT count(*) FROM recent, last_success
          WHERE recent.identifier_hash = ${identifierHash}
            AND recent.ip = ${ip}::inet
            AND recent.occurred_at > now() - interval '15 minutes'
            AND (last_success.at IS NULL OR recent.occurred_at > last_success.at))::int
          AS account_ip_failures,
        (SELECT count(*) FROM recent WHERE identifier_hash = ${identifierHash})::int
          AS account_failures,
        EXISTS (
          SELECT 1 FROM ${authEvents}
           WHERE event_type = 'login_succeeded'
             AND identifier_hash = ${identifierHash}
             AND ip = ${ip}::inet
             AND occurred_at > now() - interval '30 days'
        ) AS trusted_ip,
        now() AS now`);
    const row = result.rows[0]!;
    return {
      ipFailures: row.ip_failures,
      ipOldestFailure: row.ip_oldest_failure ? new Date(row.ip_oldest_failure) : null,
      accountIpFailures: row.account_ip_failures,
      accountFailures: row.account_failures,
      trustedIp: row.trusted_ip,
      now: new Date(row.now),
    };
  }
}
