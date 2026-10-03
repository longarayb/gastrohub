// Interface pública do módulo identity (ADR-001). Outros módulos só importam daqui.
export {
  ACTIVE_COMPANY_PORT,
  type ActiveCompanyPort,
  type ActiveCompanySummary,
} from './application/active-company.port.js';
export { type AuthContext, type RequestMeta } from './application/auth-context.js';
export { AUTH_SETTINGS, type AuthSettings } from './application/auth-settings.js';
export { type CreatedSession, SessionService } from './application/session.service.js';
export { CurrentAuth, requestMeta, setSessionCookie } from './http/request-auth.js';
export { IdentityModule } from './identity.module.js';
