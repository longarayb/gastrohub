// Administração operacional de usuários, usada pela CLI (M02 §6.9, D2).
import { EMAIL_MAX_LENGTH } from '@gastrohub/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { normalizeEmail } from '../domain/email.js';
import { validatePassword } from '../domain/password-policy.js';
import { AuthEventsRepository } from '../infrastructure/auth-events.repository.js';
import { IdentityRepository, type UserRecord } from '../infrastructure/identity.repository.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';
import { logAuthEvent } from './auth-event-log.js';

export class UserAdminError extends Error {
  override name = 'UserAdminError';
}

const emailSchema = z.email().max(EMAIL_MAX_LENGTH);
const nameSchema = z.string().trim().min(1).max(120);
const CLI = { source: 'cli' } as const;

@Injectable()
export class UserAdminService {
  constructor(
    @Inject(IdentityRepository) private readonly repo: IdentityRepository,
    @Inject(AuthEventsRepository) private readonly events: AuthEventsRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
  ) {}

  /** Normaliza e valida o e-mail; mensagens nunca ecoam a senha. */
  normalizeAndValidateEmail(raw: string): string {
    const email = normalizeEmail(raw);
    if (!emailSchema.safeParse(email).success) throw new UserAdminError('E-mail inválido.');
    return email;
  }

  passwordViolations(password: string, email: string, name: string): string[] {
    return validatePassword(password, { email, name });
  }

  async createUser(rawEmail: string, rawName: string, password: string): Promise<UserRecord> {
    const email = this.normalizeAndValidateEmail(rawEmail);
    const name = nameSchema.safeParse(rawName.normalize('NFC'));
    if (!name.success) throw new UserAdminError('Nome deve ter de 1 a 120 caracteres.');
    const violations = this.passwordViolations(password, email, name.data);
    if (violations.length > 0) throw new UserAdminError(violations.join(' '));
    if (await this.repo.findUserByEmail(email)) {
      throw new UserAdminError('Já existe um usuário com este e-mail.');
    }

    const passwordHash = await this.hasher.hash(password);
    const user = await this.repo.db.transaction(async (tx) => {
      const created = await this.repo.insertUser({ email, name: name.data, passwordHash }, tx);
      await this.events.record({ eventType: 'user_created', userId: created.id, details: CLI }, tx);
      return created;
    });
    logAuthEvent('user_created', { userId: user.id });
    return user;
  }

  /** Redefinição operacional (§2, D1): revoga todas as sessões. */
  async setPassword(rawEmail: string, password: string): Promise<void> {
    const user = await this.requireUser(rawEmail);
    const violations = this.passwordViolations(password, user.email, user.name);
    if (violations.length > 0) throw new UserAdminError(violations.join(' '));

    const passwordHash = await this.hasher.hash(password);
    await this.repo.db.transaction(async (tx) => {
      await this.repo.updatePasswordHash(user.id, passwordHash, true, tx);
      const revoked = await this.repo.revokeUserSessions(user.id, 'operator', null, tx);
      await this.events.record(
        {
          eventType: 'password_set_by_operator',
          userId: user.id,
          details: { ...CLI, revokedSessions: revoked },
        },
        tx,
      );
    });
    logAuthEvent('password_set_by_operator', { userId: user.id });
  }

  async disable(rawEmail: string): Promise<void> {
    const user = await this.requireUser(rawEmail);
    await this.repo.db.transaction(async (tx) => {
      await this.repo.setUserStatus(user.id, 'disabled', tx);
      const revoked = await this.repo.revokeUserSessions(user.id, 'user_disabled', null, tx);
      await this.events.record(
        {
          eventType: 'user_disabled',
          userId: user.id,
          details: { ...CLI, revokedSessions: revoked },
        },
        tx,
      );
    });
    logAuthEvent('user_disabled', { userId: user.id });
  }

  async enable(rawEmail: string): Promise<void> {
    const user = await this.requireUser(rawEmail);
    await this.repo.db.transaction(async (tx) => {
      await this.repo.setUserStatus(user.id, 'active', tx);
      await this.events.record({ eventType: 'user_enabled', userId: user.id, details: CLI }, tx);
    });
    logAuthEvent('user_enabled', { userId: user.id });
  }

  private async requireUser(rawEmail: string): Promise<UserRecord> {
    const user = await this.repo.findUserByEmail(this.normalizeAndValidateEmail(rawEmail));
    if (!user) throw new UserAdminError('Usuário não encontrado.');
    return user;
  }
}
