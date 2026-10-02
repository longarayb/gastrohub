import { hash } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';

import { ARGON2_PARAMS, PasswordHasher } from './password-hasher.js';

const hasher = new PasswordHasher();
const PASSWORD = 'cavalo correto bateria';

describe('PasswordHasher (§9.1)', () => {
  it('gera hash PHC argon2id com os parâmetros definidos', async () => {
    const phc = await hasher.hash(PASSWORD);
    expect(phc).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(phc).not.toContain(PASSWORD);
  });

  it('verifica senha correta e rejeita incorreta', async () => {
    const phc = await hasher.hash(PASSWORD);
    expect(await hasher.verify(phc, PASSWORD)).toBe(true);
    expect(await hasher.verify(phc, PASSWORD + 'x')).toBe(false);
  });

  it('verifica com normalização NFC', async () => {
    const phc = await hasher.hash('ação imediata já');
    expect(await hasher.verify(phc, 'ação imediata já')).toBe(true);
  });

  it('hash malformado conta como falha (sem exceção)', async () => {
    expect(await hasher.verify('nao-e-um-hash', PASSWORD)).toBe(false);
  });

  it('verificação fictícia sempre falha', async () => {
    expect(await hasher.verifyDummy(PASSWORD)).toBe(false);
  });

  it('needsRehash detecta parâmetros antigos', async () => {
    const current = await hasher.hash(PASSWORD);
    const weaker = await hash(PASSWORD, { ...ARGON2_PARAMS, memoryCost: 8192, algorithm: 2 });
    expect(hasher.needsRehash(current)).toBe(false);
    expect(hasher.needsRehash(weaker)).toBe(true);
    expect(hasher.needsRehash('invalido')).toBe(true);
  });
});
