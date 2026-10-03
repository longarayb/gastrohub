import { z } from 'zod';

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'deve ser uma URL postgres:// válida',
});

const booleanString = z
  .enum(['true', 'false'], { error: 'deve ser "true" ou "false"' })
  .transform((value) => value === 'true');

/** Segredo em base64url com pelo menos 32 bytes (M02 §9.10). */
const authSecret = z
  .string({ error: 'é obrigatória (execute pnpm env:init)' })
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'deve estar em base64url' })
  .refine((value) => Buffer.from(value, 'base64url').length >= 32, {
    error: 'deve ter pelo menos 32 bytes',
  });

/**
 * Variáveis de ambiente da API. A aplicação não inicia com configuração inválida.
 * Mensagens de erro nunca incluem os valores recebidos (podem conter credenciais).
 */
export const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: postgresUrl,

    // M02 — autenticação (docs/modules/M02-autenticacao.md §12)
    AUTH_SECRET: authSecret,
    SESSION_IDLE_TTL_MINUTES: z.coerce.number().int().min(15).max(1440).default(720),
    SESSION_ABSOLUTE_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    SESSION_COOKIE_SECURE: booleanString.default(true),
    TRUST_PROXY: z
      .string()
      .regex(/^(false|[1-9][0-9]?)$/, { error: 'deve ser "false" ou um número de proxies' })
      .default('false')
      .transform((value) => (value === 'false' ? false : Number(value))),
  })
  .superRefine((config, ctx) => {
    if (config.SESSION_ABSOLUTE_TTL_HOURS * 60 <= config.SESSION_IDLE_TTL_MINUTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_ABSOLUTE_TTL_HOURS'],
        message: 'deve ser maior que SESSION_IDLE_TTL_MINUTES',
      });
    }
    // D10: cookie sem Secure somente em desenvolvimento (HTTP local).
    if (!config.SESSION_COOKIE_SECURE && config.NODE_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'só pode ser "false" com NODE_ENV=development',
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export class InvalidConfigError extends Error {
  override name = 'InvalidConfigError';
}

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ');
    throw new InvalidConfigError(`Configuração inválida — ${issues}`);
  }
  return result.data;
}
