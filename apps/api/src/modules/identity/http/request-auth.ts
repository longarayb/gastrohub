import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import {
  type AuthContext,
  normalizeIp,
  type RequestMeta,
  truncateUserAgent,
} from '../application/auth-context.js';
import { type AuthSettings } from '../application/auth-settings.js';
import { type SessionWithUser } from '../infrastructure/identity.repository.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pelo AuthGuard quando há sessão válida. */
    auth?: AuthContext;
    authSession?: SessionWithUser;
  }
}

/** `@CurrentAuth()`: contexto autenticado da requisição (rotas protegidas). */
export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!request.auth) throw new Error('CurrentAuth usado em rota sem sessão autenticada.');
  return request.auth;
});

export function requestMeta(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers['user-agent'];
  return {
    ip: normalizeIp(request.ip),
    userAgent: truncateUserAgent(Array.isArray(userAgent) ? userAgent[0] : userAgent),
    requestId: request.id ? String(request.id).slice(0, 128) : null,
  };
}

/** Cookie de sessão (M02 §7.4): HttpOnly, SameSite=Lax, Path=/, sem Domain. */
export function setSessionCookie(
  reply: FastifyReply,
  settings: AuthSettings,
  token: string,
  expiresAt: Date,
): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  void reply.setCookie(settings.cookieName, token, {
    httpOnly: true,
    secure: settings.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookie(reply: FastifyReply, settings: AuthSettings): void {
  void reply.setCookie(settings.cookieName, '', {
    httpOnly: true,
    secure: settings.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function sessionCookieValue(
  request: FastifyRequest,
  settings: AuthSettings,
): string | undefined {
  return request.cookies?.[settings.cookieName];
}
