import { Global, Module } from '@nestjs/common';

import { ACTIVE_COMPANY_PORT, IdentityModule } from '../identity/index.js';
import { CompanyLookupService } from './application/company-lookup.service.js';
import { OrganizationAdminService } from './application/organization-admin.service.js';
import { OrganizationService } from './application/organization.service.js';
import { OrganizationController } from './http/organization.controller.js';
import { TenantGuard } from './http/tenant.guard.js';
import { OrganizationRepository } from './infrastructure/organization.repository.js';

// Global: expõe a ActiveCompanyPort ao módulo identity sem que ele importe este módulo.
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationRepository,
    CompanyLookupService,
    OrganizationService,
    OrganizationAdminService,
    TenantGuard,
    { provide: ACTIVE_COMPANY_PORT, useExisting: CompanyLookupService },
  ],
  exports: [ACTIVE_COMPANY_PORT, TenantGuard, CompanyLookupService],
})
export class OrganizationModule {}
