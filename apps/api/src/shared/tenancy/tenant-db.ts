// Acesso a tabelas de tenant (M03 §7, ADR-003). Mecanismo técnico, sem regra de negócio.
//
// Toda consulta a tabela de tenant passa por TenantDb.run, que abre uma transação e aplica
// app.company_id / app.user_id com set_config(..., true) (escopo da transação: nada vaza
// para a próxima transação na mesma conexão do pool). As políticas RLS fazem o resto.
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { type Database, DRIZZLE } from '../database/database.module.js';

/** Transação Drizzle com o contexto de tenant aplicado. */
export type TenantTx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface TenantContext {
  /** Empresa ativa: isola todas as tabelas de tenant. */
  companyId?: string | null;
  /** Usuário autenticado: só para os próprios vínculos e empresas (seletor). */
  userId?: string | null;
}

export class MissingTenantContextError extends Error {
  override name = 'MissingTenantContextError';
}

@Injectable()
export class TenantDb {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async run<T>(context: TenantContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    if (!context.companyId && !context.userId) {
      // Sem contexto o banco não devolveria nada (falha fechada); aqui o erro é explícito.
      throw new MissingTenantContextError('TenantDb.run exige companyId ou userId.');
    }
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT set_config('app.company_id', ${context.companyId ?? ''}, true),
               set_config('app.user_id', ${context.userId ?? ''}, true)`);
      return fn(tx);
    });
  }
}

@Global()
@Module({ providers: [TenantDb], exports: [TenantDb] })
export class TenancyModule {}
