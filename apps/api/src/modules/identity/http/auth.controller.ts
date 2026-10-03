// /api/v1/auth: login, logout, sessão atual e troca de senha (M02 §7).
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type CurrentSession,
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
  type PasswordChangedResponse,
} from '@gastrohub/contracts';
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { Public } from '../../../shared/http/public.decorator.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { type AuthContext } from '../application/auth-context.js';
import { AUTH_SETTINGS, type AuthSettings } from '../application/auth-settings.js';
import { LoginService } from '../application/login.service.js';
import { PasswordService } from '../application/password.service.js';
import { SessionService } from '../application/session.service.js';
import { AuthGuard } from './auth.guard.js';
import {
  clearSessionCookie,
  CurrentAuth,
  requestMeta,
  sessionCookieValue,
  setSessionCookie,
} from './request-auth.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LoginService) private readonly loginService: LoginService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthGuard) private readonly guard: AuthGuard,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login com e-mail e senha; define o cookie de sessão' })
  @ApiOkResponse({ description: 'Autenticado' })
  @ApiUnauthorizedResponse({ description: 'invalid_credentials (mensagem genérica)' })
  @ApiTooManyRequestsResponse({ description: 'rate_limited (somente por IP/global)' })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const result = await this.loginService.login(
      body,
      requestMeta(request),
      sessionCookieValue(request, this.settings),
    );
    setSessionCookie(reply, this.settings, result.token, result.session.expiresAt);
    return {
      user: result.user,
      session: this.sessions.sessionInfo(result.session),
      csrfToken: this.sessions.csrfToken(result.session.id),
      activeCompany: await this.sessions.describeActiveCompany(
        result.user.id,
        result.session.id,
        result.session.activeCompanyId,
      ),
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão atual (idempotente)' })
  @ApiNoContentResponse({ description: 'Sessão encerrada e cookie limpo' })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (request.auth) {
      // Rota pública, mas com sessão válida o token CSRF é obrigatório (§7.1).
      this.guard.assertCsrfToken(request, request.auth.sessionId);
      await this.sessions.logout(request.auth, requestMeta(request));
    }
    clearSessionCookie(reply, this.settings);
  }

  @Get('session')
  @ApiOperation({ summary: 'Sessão atual, usuário e token CSRF' })
  @ApiOkResponse({ description: 'Sessão válida' })
  @ApiUnauthorizedResponse({ description: 'unauthenticated / session_expired / session_revoked' })
  async currentSession(@Req() request: FastifyRequest): Promise<CurrentSession> {
    const session = request.authSession!;
    return {
      user: { id: session.user.id, email: session.user.email, name: session.user.name },
      session: this.sessions.sessionInfo(session),
      csrfToken: this.sessions.csrfToken(session.id),
      activeCompany: await this.sessions.describeActiveCompany(
        session.user.id,
        session.id,
        session.activeCompanyId,
      ),
    };
  }

  @Post('password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Troca de senha; revoga as outras sessões e rotaciona a atual' })
  @ApiOkResponse({ description: 'Senha alterada; novo cookie e novo token CSRF' })
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PasswordChangedResponse> {
    const created = await this.passwordService.change(auth, body, requestMeta(request));
    setSessionCookie(reply, this.settings, created.token, created.record.expiresAt);
    return {
      session: this.sessions.sessionInfo(created.record),
      csrfToken: this.sessions.csrfToken(created.record.id),
    };
  }
}
