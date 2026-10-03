// Leitura de empresas/filiais e troca de empresa ativa (M03 §4, §8).
import { type Branch, type Company, type MyCompany } from '@gastrohub/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import {
  type ActiveCompanySummary,
  type AuthContext,
  type CreatedSession,
  type RequestMeta,
  SessionService,
} from '../../identity/index.js';
import { OrganizationRepository } from '../infrastructure/organization.repository.js';
import { CompanyLookupService } from './company-lookup.service.js';
import { organizationErrors } from './organization-errors.js';

/** Contexto de tenant validado pelo TenantGuard. */
export interface TenantContext {
  companyId: string;
  userId: string;
}

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(TenantDb) private readonly tenantDb: TenantDb,
    @Inject(OrganizationRepository) private readonly repo: OrganizationRepository,
    @Inject(CompanyLookupService) private readonly lookup: CompanyLookupService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async myCompanies(auth: AuthContext): Promise<MyCompany[]> {
    const list = await this.lookup.userCompanies(auth.userId);
    return list.map((c) => ({ ...c, active: c.id === auth.activeCompanyId }));
  }

  async company(tenant: TenantContext): Promise<Company> {
    const company = await this.tenantDb.run(tenant, (tx) =>
      this.repo.findCompany(tx, tenant.companyId),
    );
    if (!company) throw organizationErrors.companyNotFound();
    return company;
  }

  async branches(tenant: TenantContext): Promise<Branch[]> {
    const rows = await this.tenantDb.run(tenant, (tx) => this.repo.listBranches(tx));
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      taxId: b.taxId,
      timezone: b.timezone,
      businessDayCutoff: b.businessDayCutoff.slice(0, 5),
      address: {
        postalCode: b.postalCode,
        street: b.street,
        number: b.number,
        complement: b.complement,
        district: b.district,
        city: b.city,
        state: b.state,
      },
      status: b.status,
    }));
  }

  /** Valida o vínculo e troca a empresa ativa com rotação de token (§4.1). */
  async switchActiveCompany(
    auth: AuthContext,
    companyId: string,
    meta: RequestMeta,
  ): Promise<{ created: CreatedSession; company: ActiveCompanySummary }> {
    const company = await this.lookup.describe(auth.userId, companyId);
    // Inexistente, sem vínculo, vínculo revogado ou empresa suspensa: 404 sem distinguir.
    if (!company) throw organizationErrors.companyNotFound();
    const created = await this.sessions.switchActiveCompany(auth, companyId, meta);
    return { created, company };
  }
}
