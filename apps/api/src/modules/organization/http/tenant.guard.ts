// Rotas de tenant (M03 §4.1, §8): exigem empresa ativa e revalidam o vínculo a cada requisição.
import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { SessionService } from '../../identity/index.js';
import { CompanyLookupService } from '../application/company-lookup.service.js';
import { organizationErrors } from '../application/organization-errors.js';
import { type TenantContext } from '../application/organization.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido pelo TenantGuard: empresa ativa com vínculo revalidado. */
    tenant?: TenantContext;
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(CompanyLookupService) private readonly lookup: CompanyLookupService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const auth = request.auth;
    // O AuthGuard global roda antes; sem sessão a requisição já recebeu 401.
    if (!auth?.activeCompanyId) throw organizationErrors.activeCompanyRequired();

    const company = await this.lookup.describe(auth.userId, auth.activeCompanyId);
    if (!company) {
      // Vínculo revogado ou empresa suspensa durante a sessão (§4.1).
      await this.sessions.clearActiveCompany(auth.sessionId);
      throw organizationErrors.companyAccessRevoked();
    }
    request.tenant = { companyId: auth.activeCompanyId, userId: auth.userId };
    return true;
  }
}

/** Marca rota/controller de tenant: exige empresa ativa válida (M03 §8). */
export const RequiresCompany = () => applyDecorators(UseGuards(TenantGuard));

/** `@CurrentTenant()`: contexto de tenant validado. */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!request.tenant) throw new Error('CurrentTenant usado em rota sem @RequiresCompany().');
  return request.tenant;
});
