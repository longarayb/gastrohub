// Argon2id (docs/modules/M02-autenticacao.md §9.1, D7).
import { randomBytes } from 'node:crypto';

import { hash, parseOptions, verify } from '@node-rs/argon2';

import { normalizePassword } from '../domain/password-policy.js';

/** `Algorithm.Argon2id` (const enum ambiente do pacote, incompatível com isolatedModules). */
const ARGON2ID = 2;

export const ARGON2_PARAMS = {
  memoryCost: 19456, // KiB (19 MiB)
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

/** Verificações/hashes simultâneos por processo (§9.1). */
export const ARGON2_MAX_CONCURRENCY = 4;

class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export class PasswordHasher {
  private readonly semaphore = new Semaphore(ARGON2_MAX_CONCURRENCY);
  private dummyHash: string | undefined;

  /** Gera o hash PHC argon2id da senha (normalizada em NFC). */
  async hash(password: string): Promise<string> {
    return this.semaphore.run(() =>
      hash(normalizePassword(password), { ...ARGON2_PARAMS, algorithm: ARGON2ID }),
    );
  }

  /** Verifica a senha contra um hash PHC. Hash malformado conta como falha. */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    return this.semaphore.run(async () => {
      try {
        return await verify(passwordHash, normalizePassword(password));
      } catch {
        return false;
      }
    });
  }

  /**
   * Executa uma verificação Argon2id contra um hash fictício com os mesmos parâmetros,
   * para igualar o tempo quando não há hash real (usuário inexistente, desativado ou
   * conta bloqueada; §9.6). Sempre resulta em falha.
   */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= await this.hash(randomBytes(32).toString('base64url'));
    await this.verify(this.dummyHash, password);
    return false;
  }

  /** Pré-computa o hash fictício (chamado no boot). */
  async warmUp(): Promise<void> {
    this.dummyHash ??= await this.hash(randomBytes(32).toString('base64url'));
  }

  /** O hash foi gerado com parâmetros inferiores aos atuais? (§9.1, rehash) */
  needsRehash(passwordHash: string): boolean {
    try {
      const options = parseOptions(passwordHash);
      return (
        options.algorithm !== ARGON2ID ||
        options.memoryCost < ARGON2_PARAMS.memoryCost ||
        options.timeCost < ARGON2_PARAMS.timeCost ||
        options.parallelism < ARGON2_PARAMS.parallelism ||
        options.outputLen < ARGON2_PARAMS.outputLen
      );
    } catch {
      return true;
    }
  }
}
