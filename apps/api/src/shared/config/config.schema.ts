import { z } from 'zod';

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'deve ser uma URL postgres:// válida',
});

/**
 * Variáveis de ambiente da API. A aplicação não inicia com configuração inválida.
 * Mensagens de erro nunca incluem os valores recebidos (podem conter credenciais).
 */
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
