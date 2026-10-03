// Porta para dados de empresa usados pela sessão (M03 §4). Definida pelo identity e
// implementada pelo módulo organization, para que o identity não dependa dele (ADR-001).

export const ACTIVE_COMPANY_PORT = Symbol('ACTIVE_COMPANY_PORT');

export interface ActiveCompanySummary {
  id: string;
  tradeName: string;
}

export interface ActiveCompanyPort {
  /**
   * Empresa a selecionar automaticamente no login: o id quando o usuário tem exatamente
   * um vínculo ativo em empresa ativa; null caso contrário (D5).
   */
  autoSelect(userId: string): Promise<string | null>;

  /** Resumo da empresa se o vínculo e a empresa ainda estiverem ativos; null caso contrário. */
  describe(userId: string, companyId: string): Promise<ActiveCompanySummary | null>;
}
