// Interface pública do módulo identity (ADR-001). Outros módulos só importam daqui.
export { type AuthContext } from './application/auth-context.js';
export { CurrentAuth } from './http/request-auth.js';
export { IdentityModule } from './identity.module.js';
