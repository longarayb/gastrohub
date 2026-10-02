import { z } from 'zod';

/** Limites de tamanho das entradas (docs/modules/M02-autenticacao.md §7.2 e §9.2). */
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_INPUT_MAX_LENGTH = 256;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// ---------------------------------------------------------------------------
// Entradas (campos desconhecidos são rejeitados)
// ---------------------------------------------------------------------------

export const loginRequestSchema = z.strictObject({
  email: z.email().max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_INPUT_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** A política completa da nova senha (§9.2) é aplicada no servidor; aqui só limites de tamanho. */
export const changePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_INPUT_MAX_LENGTH),
  newPassword: z.string().min(1).max(PASSWORD_INPUT_MAX_LENGTH),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const sessionIdParamSchema = z.strictObject({
  id: z.uuid(),
});

// ---------------------------------------------------------------------------
// Saídas
// ---------------------------------------------------------------------------

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const sessionInfoSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  idleExpiresAt: z.iso.datetime({ offset: true }),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const loginResponseSchema = z.object({
  user: authUserSchema,
  session: sessionInfoSchema,
  csrfToken: z.string(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const currentSessionSchema = loginResponseSchema;
export type CurrentSession = z.infer<typeof currentSessionSchema>;

export const passwordChangedResponseSchema = z.object({
  session: sessionInfoSchema,
  csrfToken: z.string(),
});
export type PasswordChangedResponse = z.infer<typeof passwordChangedResponseSchema>;

export const sessionListItemSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  lastSeenAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});
export type SessionListItem = z.infer<typeof sessionListItemSchema>;

export const sessionListSchema = z.object({
  data: z.array(sessionListItemSchema),
});
export type SessionList = z.infer<typeof sessionListSchema>;

// ---------------------------------------------------------------------------
// Códigos de erro estáveis (membro de extensão `code` do Problem Details, D14)
// ---------------------------------------------------------------------------

export const AUTH_ERROR_CODES = [
  'validation_failed',
  'invalid_credentials',
  'unauthenticated',
  'session_expired',
  'session_revoked',
  'csrf_failed',
  'origin_not_allowed',
  'rate_limited',
  'invalid_current_password',
  'password_reused',
  'session_not_found',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** Cabeçalho do token CSRF (§9.4). */
export const CSRF_HEADER = 'x-csrf-token';
