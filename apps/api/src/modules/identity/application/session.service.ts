// Sessões: resolução por requisição, criação, logout, listagem e revogação (M02 §5, §6.5, §6.7).
import { type SessionInfo, type SessionListItem } from '@gastrohub/contracts';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { evaluateSession, idleExpiresAt, shouldTouchLastSeen } from '../domain/session-validity.js';
import { AuthEventsRepository } from '../infrastructure/auth-events.repository.js';
import { csrfTokenFor, generateSessionToken, hashSessionToken } from '../infrastructure/crypto.js';
import {
  type Executor,
  IdentityRepository,
  type SessionRecord,
  type SessionWithUser,
} from '../infrastructure/identity.repository.js';
import {
  ACTIVE_COMPANY_PORT,
  type ActiveCompanyPort,
  type ActiveCompanySummary,
} from './active-company.port.js';
import { type AuthContext, type RequestMeta } from './auth-context.js';
import { authErrors } from './auth-errors.js';
import { logAuthEvent } from './auth-event-log.js';
import { AUTH_SETTINGS, type AuthSettings } from './auth-settings.js';

export type SessionResolution =
  | { status: 'none' }
  | { status: 'invalid' | 'expired' | 'revoked' }
  | { status: 'valid'; session: SessionWithUser; context: AuthContext };

export interface CreatedSession {
  record: SessionRecord;
  /** Token em claro: só vai para o Set-Cookie. */
  token: string;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger('ActiveCompany');

  constructor(
    @Inject(IdentityRepository) private readonly repo: IdentityRepository,
    @Inject(AuthEventsRepository) private readonly events: AuthEventsRepository,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
    // Implementada pelo módulo organization (M03); ausente → sem empresa ativa.
    @Optional()
    @Inject(ACTIVE_COMPANY_PORT)
    private readonly companies?: ActiveCompanyPort,
  ) {}

  /** Resolve o cookie recebido (§5.3). `undefined` = sem cookie. */
  async resolve(token: string | undefined): Promise<SessionResolution> {
    if (token === undefined) return { status: 'none' };
    const tokenHash = hashSessionToken(token);
    if (!tokenHash) return { status: 'invalid' };

    const session = await this.repo.findSessionByTokenHash(tokenHash);
    if (!session) return { status: 'invalid' };

    const validity = evaluateSession(
      {
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        userStatus: session.user.status,
        passwordChangedAt: session.user.passwordChangedAt,
      },
      session.now,
      this.settings.idleTtlMs,
    );
    if (validity !== 'valid') return { status: validity };

    if (shouldTouchLastSeen(session.lastSeenAt, session.now)) {
      await this.repo.touchSession(session.id);
      session.lastSeenAt = session.now;
    }
    return {
      status: 'valid',
      session,
      context: {
        userId: session.user.id,
        sessionId: session.id,
        activeCompanyId: session.activeCompanyId,
      },
    };
  }

  /** Cria sessão nova e aplica o limite de sessões ativas (§5.1). */
  async create(
    userId: string,
    meta: RequestMeta,
    db?: Executor,
    activeCompanyId: string | null = null,
  ): Promise<CreatedSession> {
    const { token, hash } = generateSessionToken();
    const record = await this.repo.insertSession(
      {
        userId,
        tokenHash: hash,
        absoluteTtlHours: this.settings.absoluteTtlHours,
        ip: meta.ip,
        userAgent: meta.userAgent,
        activeCompanyId,
      },
      db,
    );
    await this.repo.enforceSessionLimit(userId, db);
    return { record, token };
  }

  /** Empresa a selecionar no login (M03 D5), via porta do módulo organization. */
  async autoSelectCompany(userId: string): Promise<string | null> {
    return this.companies ? this.companies.autoSelect(userId) : null;
  }

  /**
   * Resumo da empresa ativa para as respostas de sessão. Se o vínculo ou a empresa não
   * estiverem mais ativos, limpa a empresa ativa da sessão e devolve null (M03 §4.1).
   */
  async describeActiveCompany(
    userId: string,
    sessionId: string,
    activeCompanyId: string | null,
  ): Promise<ActiveCompanySummary | null> {
    if (!activeCompanyId || !this.companies) return null;
    const summary = await this.companies.describe(userId, activeCompanyId);
    if (!summary) await this.clearActiveCompany(sessionId);
    return summary;
  }

  /**
   * Troca a empresa ativa com rotação de token (ADR-004, M03 §4.1): cria uma sessão nova com
   * a empresa e revoga a atual (`company_switched`). A validação do vínculo é do chamador
   * (módulo organization).
   */
  async switchActiveCompany(
    context: AuthContext,
    companyId: string,
    meta: RequestMeta,
  ): Promise<CreatedSession> {
    const created = await this.repo.db.transaction(async (tx) => {
      await this.repo.revokeSession(context.sessionId, 'company_switched', tx);
      return this.create(context.userId, meta, tx, companyId);
    });
    this.logger.log({
      event: 'active_company_switched',
      userId: context.userId,
      sessionId: created.record.id,
      companyId,
      requestId: meta.requestId,
    });
    return created;
  }

  /** Limpa a empresa ativa (vínculo revogado ou empresa suspensa durante a sessão). */
  async clearActiveCompany(sessionId: string): Promise<void> {
    await this.repo.setActiveCompany(sessionId, null);
  }

  csrfToken(sessionId: string): string {
    return csrfTokenFor(sessionId, this.settings.keys.csrfKey);
  }

  sessionInfo(record: SessionRecord): SessionInfo {
    return {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      idleExpiresAt: idleExpiresAt(record.lastSeenAt, this.settings.idleTtlMs).toISOString(),
    };
  }

  async logout(context: AuthContext, meta: RequestMeta): Promise<void> {
    const revoked = await this.repo.revokeSession(context.sessionId, 'logout');
    if (!revoked) return;
    await this.events.record({
      eventType: 'logout',
      userId: context.userId,
      sessionId: context.sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    logAuthEvent('logout', { ...context, requestId: meta.requestId });
  }

  async list(context: AuthContext): Promise<SessionListItem[]> {
    const rows = await this.repo.listActiveSessions(context.userId, this.settings.idleTtlMinutes);
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      ip: row.ip,
      userAgent: row.userAgent,
      current: row.id === context.sessionId,
    }));
  }

  /** Encerra uma sessão do próprio usuário. Devolve true se era a sessão atual (§6.7). */
  async revokeOne(context: AuthContext, sessionId: string, meta: RequestMeta): Promise<boolean> {
    const revoked = await this.repo.revokeOwnActiveSession(
      context.userId,
      sessionId,
      'revoked_by_user',
      this.settings.idleTtlMinutes,
    );
    // Outro usuário, inexistente ou já inativa: 404 sem distinguir.
    if (!revoked) throw authErrors.sessionNotFound();
    await this.events.record({
      eventType: 'session_revoked',
      userId: context.userId,
      sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    logAuthEvent('session_revoked', {
      userId: context.userId,
      sessionId,
      requestId: meta.requestId,
    });
    return sessionId === context.sessionId;
  }

  async revokeOthers(context: AuthContext, meta: RequestMeta): Promise<void> {
    const count = await this.repo.revokeUserSessions(
      context.userId,
      'revoked_others',
      context.sessionId,
    );
    await this.events.record({
      eventType: 'sessions_revoked_others',
      userId: context.userId,
      sessionId: context.sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
      details: { revoked: count },
    });
    logAuthEvent('sessions_revoked_others', { ...context, requestId: meta.requestId });
  }
}
