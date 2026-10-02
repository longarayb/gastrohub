import {
  type CurrentSession,
  type LoginRequest,
  type LoginResponse,
  type PasswordChangedResponse,
  type SessionList,
} from '@gastrohub/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch, SESSION_QUERY_KEY, type SessionState } from './api-client';

const AUTH = '/api/v1/auth';

/** Sessão atual (GET /auth/session). 401 vira estado anônimo, não erro. */
export function useSession() {
  const queryClient = useQueryClient();
  return useQuery<SessionState>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        const data = await apiFetch<CurrentSession>(queryClient, `${AUTH}/session`);
        return { status: 'authenticated', data };
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return { status: 'anonymous', ...(error.code ? { code: error.code } : {}) };
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiFetch<LoginResponse>(queryClient, `${AUTH}/login`, { method: 'POST', body }),
    onSuccess: (data) => {
      const state: SessionState = { status: 'authenticated', data };
      queryClient.setQueryData(SESSION_QUERY_KEY, state);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(queryClient, `${AUTH}/logout`, { method: 'POST' }),
    onSettled: () => {
      // Mesmo se a chamada falhar, o estado local não guarda mais nada da sessão.
      queryClient.clear();
      queryClient.setQueryData<SessionState>(SESSION_QUERY_KEY, { status: 'anonymous' });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch<PasswordChangedResponse>(queryClient, `${AUTH}/password`, {
        method: 'POST',
        body,
      }),
    onSuccess: (data) => {
      const current = queryClient.getQueryData<SessionState>(SESSION_QUERY_KEY);
      if (current?.status === 'authenticated') {
        const state: SessionState = {
          status: 'authenticated',
          data: { ...current.data, session: data.session, csrfToken: data.csrfToken },
        };
        queryClient.setQueryData(SESSION_QUERY_KEY, state);
      }
      void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });
}

export function useSessions() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => apiFetch<SessionList>(queryClient, `${AUTH}/sessions`),
    retry: false,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(queryClient, `${AUTH}/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>(queryClient, `${AUTH}/sessions/revoke-others`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });
}

/** 403 csrf_failed: busca um token novo (§8.3). */
export function useCsrfRecovery() {
  const queryClient = useQueryClient();
  return (error: unknown): boolean => {
    if (error instanceof ApiError && error.code === 'csrf_failed') {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      return true;
    }
    return false;
  };
}
