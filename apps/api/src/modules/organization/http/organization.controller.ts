// M03 §8: minhas empresas, troca de empresa ativa, empresa ativa e filiais.
import {
  type ActiveCompanySwitched,
  type BranchList,
  type Company,
  type MyCompanies,
  type SwitchActiveCompanyRequest,
  switchActiveCompanyRequestSchema,
} from '@gastrohub/contracts';
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import {
  AUTH_SETTINGS,
  type AuthContext,
  type AuthSettings,
  CurrentAuth,
  requestMeta,
  SessionService,
  setSessionCookie,
} from '../../identity/index.js';
import { OrganizationService, type TenantContext } from '../application/organization.service.js';
import { CurrentTenant, RequiresCompany } from './tenant.guard.js';

@ApiTags('organization')
@Controller()
export class OrganizationController {
  constructor(
    @Inject(OrganizationService) private readonly organization: OrganizationService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  @Get('companies')
  @ApiOperation({ summary: 'Empresas em que o usuário tem vínculo ativo' })
  @ApiOkResponse({ description: 'Lista com a empresa ativa marcada' })
  async myCompanies(@CurrentAuth() auth: AuthContext): Promise<MyCompanies> {
    return { data: await this.organization.myCompanies(auth) };
  }

  @Post('session/active-company')
  @HttpCode(200)
  @ApiOperation({ summary: 'Troca a empresa ativa (rotaciona o token de sessão)' })
  @ApiOkResponse({ description: 'Nova sessão com a empresa ativa' })
  @ApiNotFoundResponse({ description: 'company_not_found (inexistente ou sem vínculo)' })
  async switchActiveCompany(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(switchActiveCompanyRequestSchema)) body: SwitchActiveCompanyRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ActiveCompanySwitched> {
    const { created, company } = await this.organization.switchActiveCompany(
      auth,
      body.companyId,
      requestMeta(request),
    );
    setSessionCookie(reply, this.settings, created.token, created.record.expiresAt);
    return {
      session: this.sessions.sessionInfo(created.record),
      csrfToken: this.sessions.csrfToken(created.record.id),
      activeCompany: company,
    };
  }

  @Get('company')
  @RequiresCompany()
  @ApiOperation({ summary: 'Empresa ativa' })
  @ApiForbiddenResponse({ description: 'active_company_required / company_access_revoked' })
  async company(@CurrentTenant() tenant: TenantContext): Promise<Company> {
    return this.organization.company(tenant);
  }

  @Get('branches')
  @RequiresCompany()
  @ApiOperation({ summary: 'Filiais da empresa ativa' })
  @ApiForbiddenResponse({ description: 'active_company_required / company_access_revoked' })
  async branches(@CurrentTenant() tenant: TenantContext): Promise<BranchList> {
    return { data: await this.organization.branches(tenant) };
  }
}
