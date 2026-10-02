// Erros públicos da autenticação (M02 §7.3). Mensagens genéricas e estáveis.
import { ApiException, type FieldError } from '../../../shared/http/api-exception.js';

export const INVALID_CREDENTIALS_DETAIL =
  'E-mail ou senha inválidos. Após várias tentativas, aguarde alguns minutos antes de tentar novamente.';
export const RATE_LIMITED_DETAIL = 'Muitas requisições. Tente novamente mais tarde.';
export const INVALID_CURRENT_PASSWORD_DETAIL = 'Senha atual incorreta.';

export type UnauthenticatedCode = 'unauthenticated' | 'session_expired' | 'session_revoked';

const UNAUTHENTICATED_DETAIL: Record<UnauthenticatedCode, string> = {
  unauthenticated: 'Autenticação necessária.',
  session_expired: 'Sua sessão expirou.',
  session_revoked: 'Sua sessão foi encerrada.',
};

export const authErrors = {
  /** Usuário inexistente, senha errada, desativado ou conta bloqueada: indistinguíveis (§9.5/§9.6). */
  invalidCredentials: () =>
    new ApiException(401, 'invalid_credentials', INVALID_CREDENTIALS_DETAIL),

  unauthenticated: (code: UnauthenticatedCode) =>
    new ApiException(401, code, UNAUTHENTICATED_DETAIL[code]),

  /** Somente para limites por IP e global; nunca por conta (§9.5). */
  rateLimited: (retryAfterSeconds: number) =>
    new ApiException(429, 'rate_limited', RATE_LIMITED_DETAIL, undefined, {
      'Retry-After': String(retryAfterSeconds),
    }),

  originNotAllowed: () =>
    new ApiException(403, 'origin_not_allowed', 'Origem da requisição não permitida.'),

  csrfFailed: () => new ApiException(403, 'csrf_failed', 'Token CSRF ausente ou inválido.'),

  /** Também usado quando a conta está bloqueada na troca de senha (§6.6). */
  invalidCurrentPassword: () =>
    new ApiException(400, 'invalid_current_password', INVALID_CURRENT_PASSWORD_DETAIL),

  passwordReused: () =>
    new ApiException(400, 'password_reused', 'A nova senha deve ser diferente da atual.'),

  passwordPolicy: (violations: string[]) =>
    new ApiException(
      400,
      'validation_failed',
      'Um ou mais campos são inválidos.',
      violations.map<FieldError>((message) => ({ field: 'newPassword', message })),
    ),

  sessionNotFound: () => new ApiException(404, 'session_not_found', 'Sessão não encontrada.'),
};
