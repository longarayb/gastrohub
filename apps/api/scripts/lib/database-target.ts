// Utilitários compartilhados por scripts/migrate.ts e pelos testes de integração.
// Executado diretamente pelo Node 24 (type stripping): somente sintaxe TypeScript apagável.

export function databaseNameFromUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

/**
 * Proteção obrigatória: testes e migrations de teste só rodam contra bancos cujo nome
 * termina em `_test`. Impede apagar o banco de desenvolvimento por engano.
 */
export function assertTestDatabaseUrl(url: string | undefined, variable: string): string {
  if (!url) {
    throw new Error(`${variable} não está definida (execute pnpm env:init).`);
  }
  const name = databaseNameFromUrl(url);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Recusado: ${variable} aponta para o banco "${name}", que não termina em "_test". ` +
        'Testes nunca rodam fora de um banco de teste.',
    );
  }
  return url;
}

export function requireEnv(variable: string): string {
  const value = process.env[variable];
  if (!value) {
    throw new Error(`${variable} não está definida (execute pnpm env:init).`);
  }
  return value;
}
