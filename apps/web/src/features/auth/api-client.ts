// Cliente HTTP único da web (M02 §8.1): same-origin, JSON, X-CSRF-Token automático em
// métodos mutáveis e Problem Details convertido em ApiError com `code`.
import { type CurrentSession, problemDetailsSchema } from '@gastrohub/contracts';
import { type QueryClient } from '@tanstack/react-query';

export const SESSION_QUERY_KEY = ['auth', 'session'] as const;

export type SessionState =
  /** `companyRevoked`: o acesso à empresa ativa foi encerrado durante o uso (M03 §10). */
  | { status: 'authenticated'; data: CurrentSession; companyRevoked?: boolean }
  /** `code`: motivo do último 401 (session_expired, session_revoked...), quando houver. */
  | { status: 'anonymous'; code?: string };

/** Prefixo das queries de dados de tenant: limpas na troca de empresa (M03 §10). */
export const TENANT_QUERY_PREFIX = 'tenant';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly detail: string | undefined,
    readonly fieldErrors: { field: string; message: string }[] = [],
    readonly retryAfterSeconds: number | undefined = undefined,
  ) {
    super(detail ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

/** Falha de rede (sem resposta do servidor). */
export class NetworkError extends Error {
  override name = 'NetworkError';
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** Token CSRF atual: somente em memória, no cache do TanStack Query. */
export function currentCsrfToken(queryClient: QueryClient): string | undefined {
  const state = queryClient.getQueryData<SessionState>(SESSION_QUERY_KEY);
  return state?.status === 'authenticated' ? state.data.csrfToken : undefined;
}

export async function apiFetch<T>(
  queryClient: QueryClient,
  path: string,
  { method = 'GET', body }: ApiRequest = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (UNSAFE_METHODS.has(method)) {
    const csrf = currentCsrfToken(queryClient);
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new NetworkError('Não foi possível conectar ao servidor.');
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) return payload as T;

  const problem = problemDetailsSchema.safeParse(payload);
  const retryAfter = Number(response.headers.get('Retry-After'));
  const error = new ApiError(
    response.status,
    problem.success ? problem.data.code : undefined,
    problem.success ? problem.data.detail : undefined,
    problem.success ? (problem.data.errors ?? []) : [],
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );

  // 403 company_access_revoked: a sessão continua, mas sem empresa ativa (M03 §10).
  if (error.code === 'company_access_revoked') {
    const current = queryClient.getQueryData<SessionState>(SESSION_QUERY_KEY);
    queryClient.removeQueries({ queryKey: [TENANT_QUERY_PREFIX] });
    if (current?.status === 'authenticated') {
      const state: SessionState = {
        status: 'authenticated',
        data: { ...current.data, activeCompany: null },
        companyRevoked: true,
      };
      queryClient.setQueryData(SESSION_QUERY_KEY, state);
    }
  }

  // 401 em qualquer chamada: a sessão acabou (§8.3). RequireAuth redireciona para o login.
  if (response.status === 401 && !path.endsWith('/auth/login')) {
    queryClient.setQueryData<SessionState>(SESSION_QUERY_KEY, {
      status: 'anonymous',
      ...(error.code ? { code: error.code } : {}),
    });
  }
  throw error;
}
