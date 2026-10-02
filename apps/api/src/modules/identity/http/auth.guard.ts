// Guard global de autenticação (M02 §5.3, §9.4). Nega por padrão; rotas públicas usam @Public().
import { CSRF_HEADER } from '@gastrohub/contracts';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { IS_PUBLIC_ROUTE } from '../../../shared/http/public.decorator.js';
import { authErrors } from '../application/auth-errors.js';
import { AUTH_SETTINGS, type AuthSettings } from '../application/auth-settings.js';
import { SessionService } from '../application/session.service.js';
import { isValidCsrfToken } from '../infrastructure/crypto.js';
import { clearSessionCookie, sessionCookieValue } from './request-auth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const unsafe = !SAFE_METHODS.has(request.method);

    // CSRF camada 1: origem, para todo método mutável (inclusive login).
    if (unsafe) this.assertAllowedOrigin(request);

    const token = sessionCookieValue(request, this.settings);
    const resolution = await this.sessions.resolve(token);
    if (resolution.status === 'valid') {
      request.auth = resolution.context;
      request.authSession = resolution.session;
    } else if (token !== undefined) {
      // Cookie presente, mas inválido/expirado/revogado: sempre limpar (§5.3).
      clearSessionCookie(reply, this.settings);
    }

    if (isPublic) return true;

    if (resolution.status !== 'valid') {
      throw authErrors.unauthenticated(
        resolution.status === 'expired'
          ? 'session_expired'
          : resolution.status === 'revoked'
            ? 'session_revoked'
            : 'unauthenticated',
      );
    }

    // CSRF camada 3: token sincronizador em métodos mutáveis autenticados.
    if (unsafe) this.assertCsrfToken(request, resolution.context.sessionId);
    return true;
  }

  /** Usado também pelo logout (rota pública que exige CSRF se houver sessão). */
  assertCsrfToken(request: FastifyRequest, sessionId: string): void {
    const header = request.headers[CSRF_HEADER];
    const received = Array.isArray(header) ? header[0] : header;
    if (!isValidCsrfToken(received, sessionId, this.settings.keys.csrfKey)) {
      throw authErrors.csrfFailed();
    }
  }

  private assertAllowedOrigin(request: FastifyRequest): void {
    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (!this.settings.allowedOrigins.includes(origin)) throw authErrors.originNotAllowed();
      return;
    }
    if (request.headers['sec-fetch-site'] !== 'same-origin') throw authErrors.originNotAllowed();
  }
}
