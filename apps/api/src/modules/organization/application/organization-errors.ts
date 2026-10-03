// Erros públicos do M03 (§8, D10).
import { ApiException } from '../../../shared/http/api-exception.js';

export const organizationErrors = {
  activeCompanyRequired: () =>
    new ApiException(403, 'active_company_required', 'Selecione uma empresa para continuar.'),
  companyAccessRevoked: () =>
    new ApiException(403, 'company_access_revoked', 'Seu acesso a esta empresa foi encerrado.'),
  /** Inexistente ou sem vínculo: indistinguíveis. */
  companyNotFound: () => new ApiException(404, 'company_not_found', 'Empresa não encontrada.'),
};
