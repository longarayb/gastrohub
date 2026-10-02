import { Logger } from '@nestjs/common';

import { type AuthEventType } from '../infrastructure/schema.js';

const logger = new Logger('AuthEvent');

/**
 * Log de aplicação de eventos de autenticação (§9.7): somente event, userId, sessionId e
 * requestId. Nunca senha, token, CSRF ou e-mail.
 */
export function logAuthEvent(
  event: AuthEventType,
  fields: { userId?: string | null; sessionId?: string | null; requestId?: string | null },
): void {
  logger.log({
    event,
    userId: fields.userId ?? null,
    sessionId: fields.sessionId ?? null,
    requestId: fields.requestId ?? null,
  });
}
