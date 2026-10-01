import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.schema.js';
import { verifyRuntimeRole } from './runtime-role.js';

export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');

export type Database = NodePgDatabase;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const pool = new pg.Pool({
          connectionString: config.DATABASE_URL,
          max: 10,
          connectionTimeoutMillis: 5_000,
          application_name: 'gastrohub-api',
        });
        // Conexões ociosas que caem (ex.: banco reiniciado) não podem derrubar o processo;
        // a indisponibilidade aparece em /health/ready (503).
        pool.on('error', (error) =>
          new Logger('PgPool').error(`Conexão ociosa com o PostgreSQL falhou: ${error.message}`),
        );
        return pool;
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Database => drizzle({ client: pool }),
    },
  ],
  exports: [PG_POOL, DRIZZLE],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** Falha fechada: sem verificar o papel do banco, a API não inicia. */
  async onModuleInit(): Promise<void> {
    const role = await verifyRuntimeRole(this.pool);
    this.logger.log(`Conectado ao PostgreSQL como "${role.rolname}" (sem SUPERUSER/BYPASSRLS).`);
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.pool.ended) {
      await this.pool.end();
    }
  }
}
