import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carrega o .env da raiz do monorepo, se existir (desenvolvimento local).
 * Variáveis já definidas no ambiente (containers, CI) têm precedência.
 */
export function loadLocalEnv(): void {
  // src/shared/config → raiz do repositório (vale também para dist/shared/config)
  const envPath = resolve(import.meta.dirname, '../../../../../.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}
