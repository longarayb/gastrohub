// /api/v1/auth/sessions: sessões/dispositivos do próprio usuário (M02 §6.7).
import { sessionIdParamSchema, type SessionList } from '@gastrohub/contracts';
import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { type AuthContext } from '../application/auth-context.js';
import { AUTH_SETTINGS, type AuthSettings } from '../application/auth-settings.js';
import { SessionService } from '../application/session.service.js';
import { clearSessionCookie, CurrentAuth, requestMeta } from './request-auth.js';

@ApiTags('auth')
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Sessões ativas do próprio usuário' })
  @ApiOkResponse({ description: 'Lista com a sessão atual marcada' })
  async list(@CurrentAuth() auth: AuthContext): Promise<SessionList> {
    return { data: await this.sessions.list(auth) };
  }

  @Post('revoke-others')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra todas as outras sessões' })
  @ApiNoContentResponse({ description: 'Outras sessões encerradas' })
  async revokeOthers(@CurrentAuth() auth: AuthContext, @Req() request: FastifyRequest) {
    await this.sessions.revokeOthers(auth, requestMeta(request));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra uma sessão do próprio usuário' })
  @ApiNoContentResponse({ description: 'Sessão encerrada' })
  @ApiNotFoundResponse({ description: 'session_not_found' })
  async revokeOne(
    @CurrentAuth() auth: AuthContext,
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: { id: string },
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const wasCurrent = await this.sessions.revokeOne(auth, params.id, requestMeta(request));
    // Encerrar a própria sessão atual equivale a logout (§6.7).
    if (wasCurrent) clearSessionCookie(reply, this.settings);
  }
}
