// Implementação da ActiveCompanyPort do identity (M03 §4). Não depende de sessão, para
// não criar ciclo de dependência (SessionService → porta → SessionService).
import { Inject, Injectable } from '@nestjs/common';

import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { type ActiveCompanyPort, type ActiveCompanySummary } from '../../identity/index.js';
import {
  type CompanySummary,
  OrganizationRepository,
} from '../infrastructure/organization.repository.js';

@Injectable()
export class CompanyLookupService implements ActiveCompanyPort {
  constructor(
    @Inject(TenantDb) private readonly tenantDb: TenantDb,
    @Inject(OrganizationRepository) private readonly repo: OrganizationRepository,
  ) {}

  /** Empresas com vínculo ativo em empresa ativa (contexto app.user_id). */
  async userCompanies(userId: string): Promise<CompanySummary[]> {
    return this.tenantDb.run({ userId }, (tx) => this.repo.listUserCompanies(tx, userId));
  }

  async autoSelect(userId: string): Promise<string | null> {
    const list = await this.userCompanies(userId);
    return list.length === 1 ? list[0]!.id : null;
  }

  async describe(userId: string, companyId: string): Promise<ActiveCompanySummary | null> {
    return this.tenantDb.run({ companyId, userId }, (tx) =>
      this.repo.findActiveMembership(tx, companyId, userId),
    );
  }
}
