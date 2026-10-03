// Login (M02 §6.1). Falhas e bloqueios por conta são indistinguíveis para o cliente (§9.5, §9.6).
import { type AuthUser, type LoginRequest } from '@gastrohub/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { normalizeEmail } from '../domain/email.js';
import { AuthEventsRepository } from '../infrastructure/auth-events.repository.js';
import { hashSessionToken, loginIdentifierHash } from '../infrastructure/crypto.js';
import { IdentityRepository, type SessionRecord } from '../infrastructure/identity.repository.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';
import { type RequestMeta } from './auth-context.js';
import { authErrors } from './auth-errors.js';
import { logAuthEvent } from './auth-event-log.js';
import { AUTH_SETTINGS, type AuthSettings } from './auth-settings.js';
import { decideRateLimit } from './rate-limit.js';
import { SessionService } from './session.service.js';

export interface LoginResult {
  user: AuthUser;
  session: SessionRecord;
  token: string;
}

@Injectable()
export class LoginService {
  constructor(
    @Inject(IdentityRepository) private readonly repo: IdentityRepository,
    @Inject(AuthEventsRepository) private readonly events: AuthEventsRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  /** `currentToken`: cookie de sessão recebido, para rotação (`replaced`, §5.5). */
  async login(
    input: LoginRequest,
    meta: RequestMeta,
    currentToken: string | undefined,
  ): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const identifierHash = loginIdentifierHash(email, this.settings.keys.identifierKey);
    const base = {
      identifierHash,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    };

    // 1. Rate limit (IP → 429; conta → resposta idêntica a credenciais inválidas).
    const decision = decideRateLimit(await this.events.failureCounters(identifierHash, meta.ip));
    if (decision.blocked) {
      await this.events.record({
        ...base,
        eventType: 'login_rate_limited',
        details: { scope: decision.scope, operation: 'login' },
      });
      logAuthEvent('login_rate_limited', { requestId: meta.requestId });
      if (decision.scope === 'ip') throw authErrors.rateLimited(decision.retryAfterSeconds);
      await this.hasher.verifyDummy(input.password);
      throw authErrors.invalidCredentials();
    }

    // 2. Usuário + Argon2id (sempre executado; hash fictício se não houver usuário).
    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      await this.hasher.verifyDummy(input.password);
      return this.fail(base, null, 'unknown_user');
    }
    const passwordOk = await this.hasher.verify(user.passwordHash, input.password);
    if (user.status !== 'active') return this.fail(base, user.id, 'user_disabled');
    if (!passwordOk) return this.fail(base, user.id, 'wrong_password');

    // 3. Sucesso: rehash, rotação, sessão nova, last_login e evento, em uma transação.
    const rehash = this.hasher.needsRehash(user.passwordHash)
      ? await this.hasher.hash(input.password)
      : null;
    const currentHash = hashSessionToken(currentToken);
    // M03 D5: com exatamente uma empresa, ela já vem selecionada.
    const activeCompanyId = await this.sessions.autoSelectCompany(user.id);

    const created = await this.repo.db.transaction(async (tx) => {
      if (currentHash) {
        const previous = await this.repo.findSessionByTokenHash(currentHash, tx);
        if (previous && !previous.revokedAt) {
          await this.repo.revokeSession(previous.id, 'replaced', tx);
        }
      }
      if (rehash) await this.repo.updatePasswordHash(user.id, rehash, false, tx);
      const session = await this.sessions.create(user.id, meta, tx, activeCompanyId);
      await this.repo.updateLastLogin(user.id, tx);
      await this.events.record(
        { ...base, eventType: 'login_succeeded', userId: user.id, sessionId: session.record.id },
        tx,
      );
      return session;
    });
    logAuthEvent('login_succeeded', {
      userId: user.id,
      sessionId: created.record.id,
      requestId: meta.requestId,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      session: created.record,
      token: created.token,
    };
  }

  private async fail(
    base: {
      identifierHash: Buffer;
      ip: string;
      userAgent: string | null;
      requestId: string | null;
    },
    userId: string | null,
    reason: 'unknown_user' | 'wrong_password' | 'user_disabled',
  ): Promise<never> {
    await this.events.record({ ...base, eventType: 'login_failed', userId, details: { reason } });
    logAuthEvent('login_failed', { userId, requestId: base.requestId });
    throw authErrors.invalidCredentials();
  }
}
