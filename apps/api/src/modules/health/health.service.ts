import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type pg from 'pg';

import { PG_POOL } from '../../shared/database/database.module.js';

const READY_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** Verifica se o banco responde com o papel de runtime. Lança 503 se não responder. */
  async assertDatabaseReady(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), READY_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.pool.query('SELECT 1'), timeout]);
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponível.');
    } finally {
      clearTimeout(timer);
    }
  }
}
