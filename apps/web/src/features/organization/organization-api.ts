import {
  type ActiveCompanySwitched,
  type BranchList,
  type Company,
  type MyCompanies,
} from '@gastrohub/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  apiFetch,
  SESSION_QUERY_KEY,
  type SessionState,
  TENANT_QUERY_PREFIX,
} from '../auth/api-client';

export function useMyCompanies() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['auth', 'companies'],
    queryFn: () => apiFetch<MyCompanies>(queryClient, '/api/v1/companies'),
    retry: false,
  });
}

/**
 * Troca a empresa ativa e descarta todo dado fora de `['auth', …]` (nada de uma empresa aparece
 * na outra). A sessão é atualizada no lugar, não removida: `queryClient.clear()` deixaria
 * observadores montados (ex.: o cabeçalho) presos à query removida, exibindo a empresa antiga.
 */
export function useSwitchCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) =>
      apiFetch<ActiveCompanySwitched>(queryClient, '/api/v1/session/active-company', {
        method: 'POST',
        body: { companyId },
      }),
    onSuccess: (data) => {
      const current = queryClient.getQueryData<SessionState>(SESSION_QUERY_KEY);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'auth' && query.queryKey[1] !== SESSION_QUERY_KEY[1],
      });
      if (current?.status === 'authenticated') {
        const state: SessionState = {
          status: 'authenticated',
          data: {
            ...current.data,
            session: data.session,
            csrfToken: data.csrfToken,
            activeCompany: data.activeCompany,
          },
        };
        queryClient.setQueryData(SESSION_QUERY_KEY, state);
      }
    },
  });
}

export function useCompany() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [TENANT_QUERY_PREFIX, 'company'],
    queryFn: () => apiFetch<Company>(queryClient, '/api/v1/company'),
    retry: false,
  });
}

export function useBranches() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [TENANT_QUERY_PREFIX, 'branches'],
    queryFn: () => apiFetch<BranchList>(queryClient, '/api/v1/branches'),
    retry: false,
  });
}

/** Exibição do CNPJ (numérico ou alfanumérico): 12.ABC.345/01DE-35. */
export function formatCnpj(taxId: string): string {
  return taxId.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}
