// Interface pública do módulo organization (ADR-001).
export { type TenantContext } from './application/organization.service.js';
export { CurrentTenant, RequiresCompany } from './http/tenant.guard.js';
export { OrganizationModule } from './organization.module.js';
