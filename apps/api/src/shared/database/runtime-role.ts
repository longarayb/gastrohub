import { type Pool } from 'pg';

export interface DatabaseRoleFlags {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

export class UnsafeDatabaseRoleError extends Error {
  override name = 'UnsafeDatabaseRoleError';
}

/**
 * Superusuários e papéis com BYPASSRLS ignoram Row-Level Security, o que anularia o
 * isolamento entre empresas (ADR-003). A API se recusa a operar com esses papéis.
 */
export function assertSafeRuntimeRole(flags: DatabaseRoleFlags): void {
  const reasons: string[] = [];
  if (flags.rolsuper) reasons.push('é SUPERUSER');
  if (flags.rolbypassrls) reasons.push('possui BYPASSRLS');
  if (reasons.length > 0) {
    throw new UnsafeDatabaseRoleError(
      `O usuário de banco "${flags.rolname}" ${reasons.join(' e ')}. ` +
        'A API deve conectar como gastrohub_app (ver docs/02-BANCO-DE-DADOS.md §2).',
    );
  }
}

export async function verifyRuntimeRole(pool: Pool): Promise<DatabaseRoleFlags> {
  const { rows } = await pool.query<DatabaseRoleFlags>(
    'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  );
  const flags = rows[0];
  if (!flags) {
    throw new UnsafeDatabaseRoleError('Não foi possível identificar o usuário de banco atual.');
  }
  assertSafeRuntimeRole(flags);
  return flags;
}
