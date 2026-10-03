// Acesso a users e sessions (M02 §4, §5). Todo acesso a estas tabelas passa por aqui.
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import { type Database, DRIZZLE } from '../../../shared/database/database.module.js';
import { type RevokedReason, sessions, type UserStatus, users } from './schema.js';

/** Banco ou transação Drizzle. */
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: UserStatus;
  passwordChangedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  /** Empresa ativa (M03 §4); null = nenhuma selecionada. */
  activeCompanyId: string | null;
}

export interface SessionWithUser extends SessionRecord {
  revokedAt: Date | null;
  user: UserRecord;
  /** Relógio do banco no momento da consulta. */
  now: Date;
}

export interface NewSession {
  userId: string;
  tokenHash: Buffer;
  absoluteTtlHours: number;
  ip: string | null;
  userAgent: string | null;
  activeCompanyId?: string | null;
}

/** Limite de sessões ativas por usuário (D3). */
export const MAX_ACTIVE_SESSIONS = 20;

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  passwordHash: users.passwordHash,
  status: users.status,
  passwordChangedAt: users.passwordChangedAt,
};

const sessionColumns = {
  id: sessions.id,
  userId: sessions.userId,
  createdAt: sessions.createdAt,
  lastSeenAt: sessions.lastSeenAt,
  expiresAt: sessions.expiresAt,
  activeCompanyId: sessions.activeCompanyId,
};

@Injectable()
export class IdentityRepository {
  constructor(@Inject(DRIZZLE) readonly db: Database) {}

  // ---------------------------------------------------------------- users

  async findUserByEmail(email: string, db: Executor = this.db): Promise<UserRecord | null> {
    const [row] = await db.select(userColumns).from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  }

  async findUserById(id: string, db: Executor = this.db): Promise<UserRecord | null> {
    const [row] = await db.select(userColumns).from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async insertUser(
    data: { email: string; name: string; passwordHash: string },
    db: Executor = this.db,
  ): Promise<UserRecord> {
    const [row] = await db.insert(users).values(data).returning(userColumns);
    return row!;
  }

  /** Grava novo hash. `markChanged` atualiza password_changed_at (invalida sessões antigas). */
  async updatePasswordHash(
    userId: string,
    passwordHash: string,
    markChanged: boolean,
    db: Executor = this.db,
  ): Promise<void> {
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: sql`now()`,
        ...(markChanged ? { passwordChangedAt: sql`now()` } : {}),
      })
      .where(eq(users.id, userId));
  }

  async updateLastLogin(userId: string, db: Executor = this.db): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
  }

  async setUserStatus(userId: string, status: UserStatus, db: Executor = this.db): Promise<void> {
    await db
      .update(users)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
  }

  // ------------------------------------------------------------- sessions

  async insertSession(data: NewSession, db: Executor = this.db): Promise<SessionRecord> {
    const [row] = await db
      .insert(sessions)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: sql`now() + make_interval(hours => ${data.absoluteTtlHours})`,
        ip: data.ip,
        userAgent: data.userAgent,
        activeCompanyId: data.activeCompanyId ?? null,
      })
      .returning(sessionColumns);
    return row!;
  }

  /** Define (ou limpa) a empresa ativa de uma sessão (M03 §4). */
  async setActiveCompany(
    sessionId: string,
    companyId: string | null,
    db: Executor = this.db,
  ): Promise<void> {
    await db.update(sessions).set({ activeCompanyId: companyId }).where(eq(sessions.id, sessionId));
  }

  async findSessionByTokenHash(
    tokenHash: Buffer,
    db: Executor = this.db,
  ): Promise<SessionWithUser | null> {
    const [row] = await db
      .select({
        ...sessionColumns,
        revokedAt: sessions.revokedAt,
        user: userColumns,
        now: sql<Date>`now()`.mapWith((value: string | Date) => new Date(value)),
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async touchSession(sessionId: string, db: Executor = this.db): Promise<void> {
    await db
      .update(sessions)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(sessions.id, sessionId));
  }

  /** Revoga uma sessão ainda não revogada. Devolve true se revogou. */
  async revokeSession(
    sessionId: string,
    reason: RevokedReason,
    db: Executor = this.db,
  ): Promise<boolean> {
    const rows = await db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  /** Revoga uma sessão do usuário que ainda esteja válida (§6.7). Devolve true se revogou. */
  async revokeOwnActiveSession(
    userId: string,
    sessionId: string,
    reason: RevokedReason,
    idleTtlMinutes: number,
    db: Executor = this.db,
  ): Promise<boolean> {
    const rows = await db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
          gt(sessions.lastSeenAt, sql`now() - make_interval(mins => ${idleTtlMinutes})`),
        ),
      )
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  /** Revoga todas as sessões não revogadas do usuário (exceto `exceptSessionId`). */
  async revokeUserSessions(
    userId: string,
    reason: RevokedReason,
    exceptSessionId: string | null,
    db: Executor = this.db,
  ): Promise<number> {
    const rows = await db
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          ...(exceptSessionId ? [ne(sessions.id, exceptSessionId)] : []),
        ),
      )
      .returning({ id: sessions.id });
    return rows.length;
  }

  /** Mantém no máximo MAX_ACTIVE_SESSIONS sessões ativas; revoga as mais antigas (D3). */
  async enforceSessionLimit(userId: string, db: Executor = this.db): Promise<void> {
    await db.execute(sql`
      UPDATE ${sessions}
         SET revoked_at = now(), revoked_reason = 'session_limit'
       WHERE id IN (
         SELECT id FROM ${sessions}
          WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC, id DESC
          OFFSET ${MAX_ACTIVE_SESSIONS}
       )`);
  }

  /** Sessões válidas do usuário, mais recentes primeiro (§6.7). */
  async listActiveSessions(userId: string, idleTtlMinutes: number, db: Executor = this.db) {
    return db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
        ip: sessions.ip,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
          gt(sessions.lastSeenAt, sql`now() - make_interval(mins => ${idleTtlMinutes})`),
        ),
      )
      .orderBy(desc(sessions.createdAt), desc(sessions.id));
  }
}
