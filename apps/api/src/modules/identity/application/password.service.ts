// Troca de senha pelo próprio usuário (M02 §6.6).
import { type ChangePasswordRequest } from '@gastrohub/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { normalizeEmail } from '../domain/email.js';
import { validatePassword } from '../domain/password-policy.js';
import { AuthEventsRepository } from '../infrastructure/auth-events.repository.js';
import { loginIdentifierHash } from '../infrastructure/crypto.js';
import { IdentityRepository } from '../infrastructure/identity.repository.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';
import { type AuthContext, type RequestMeta } from './auth-context.js';
import { authErrors } from './auth-errors.js';
import { logAuthEvent } from './auth-event-log.js';
import { AUTH_SETTINGS, type AuthSettings } from './auth-settings.js';
import { decideRateLimit } from './rate-limit.js';
import { type CreatedSession, SessionService } from './session.service.js';

@Injectable()
export class PasswordService {
  constructor(
    @Inject(IdentityRepository) private readonly repo: IdentityRepository,
    @Inject(AuthEventsRepository) private readonly events: AuthEventsRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  /** Devolve a sessão nova do dispositivo atual; todas as anteriores são revogadas. */
  async change(
    context: AuthContext,
    input: ChangePasswordRequest,
    meta: RequestMeta,
  ): Promise<CreatedSession> {
    const user = await this.repo.findUserById(context.userId);
    if (!user) throw authErrors.unauthenticated('session_revoked');

    const identifierHash = loginIdentifierHash(
      normalizeEmail(user.email),
      this.settings.keys.identifierKey,
    );
    const base = {
      userId: user.id,
      sessionId: context.sessionId,
      identifierHash,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    };

    // 1. Rate limit pelos mesmos contadores do login (§9.5).
    const decision = decideRateLimit(await this.events.failureCounters(identifierHash, meta.ip));
    if (decision.blocked) {
      await this.events.record({
        ...base,
        eventType: 'login_rate_limited',
        details: { scope: decision.scope, operation: 'password_change' },
      });
      logAuthEvent('login_rate_limited', context);
      if (decision.scope === 'ip') throw authErrors.rateLimited(decision.retryAfterSeconds);
      // Bloqueio por conta: resposta idêntica a senha atual incorreta.
      await this.hasher.verifyDummy(input.currentPassword);
      throw authErrors.invalidCurrentPassword();
    }

    // 2. Senha atual (falha conta para o rate limit; a sessão não é derrubada).
    if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) {
      await this.events.record({ ...base, eventType: 'password_change_failed' });
      logAuthEvent('password_change_failed', { ...context, requestId: meta.requestId });
      throw authErrors.invalidCurrentPassword();
    }

    // 3. Política da nova senha; 4. diferente da atual.
    const violations = validatePassword(input.newPassword, { email: user.email, name: user.name });
    if (violations.length > 0) throw authErrors.passwordPolicy(violations);
    if (await this.hasher.verify(user.passwordHash, input.newPassword)) {
      throw authErrors.passwordReused();
    }

    // 5. Novo hash; revoga todas as sessões; sessão nova para este dispositivo.
    const newHash = await this.hasher.hash(input.newPassword);
    const created = await this.repo.db.transaction(async (tx) => {
      await this.repo.updatePasswordHash(user.id, newHash, true, tx);
      await this.repo.revokeUserSessions(user.id, 'password_changed', null, tx);
      const session = await this.sessions.create(user.id, meta, tx);
      await this.events.record(
        { ...base, eventType: 'password_changed', sessionId: session.record.id },
        tx,
      );
      return session;
    });
    logAuthEvent('password_changed', {
      userId: user.id,
      sessionId: created.record.id,
      requestId: meta.requestId,
    });
    return created;
  }
}
