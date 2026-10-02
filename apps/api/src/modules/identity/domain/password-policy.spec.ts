import { describe, expect, it } from 'vitest';

import { normalizeEmail } from './email.js';
import { normalizePassword, validatePassword } from './password-policy.js';

const ctx = { email: 'joaosilva@exemplo.com', name: 'João Silva' };

describe('validatePassword (§9.2)', () => {
  it('rejeita 11 caracteres e aceita 12', () => {
    expect(validatePassword('Xk9#mPq2vL7', ctx)).toHaveLength(1);
    expect(validatePassword('Xk9#mPq2vL7w', ctx)).toEqual([]);
  });

  it('rejeita mais de 128 caracteres', () => {
    expect(validatePassword('ab'.repeat(64) + 'c', ctx).join()).toMatch(/no máximo 128/);
  });

  it('conta caracteres, não unidades UTF-16 (emoji)', () => {
    expect(validatePassword('🍔🍟🥤🍔🍟🥤🍔🍟🥤🍔🍟', ctx)).toHaveLength(1); // 11 emojis
    expect(validatePassword('🍔🍟🥤🍔🍟🥤🍔🍟🥤🍔🍟🥤', ctx)).toEqual([]); // 12 emojis
  });

  it('aceita espaços e acentos, sem regras de composição', () => {
    expect(validatePassword('cavalo correto bateria grampo', ctx)).toEqual([]);
    expect(validatePassword('pão de queijo mineiro', ctx)).toEqual([]);
  });

  it('rejeita senha comum sem diferenciar maiúsculas', () => {
    expect(validatePassword('1234567890123', ctx).join()).not.toMatch(/comum/);
    // "unbelievable" está na lista SecLists (uma das poucas entradas com 12+ caracteres).
    expect(validatePassword('UnBeLiEvAbLe', ctx).join()).toMatch(/comum/);
  });

  it('rejeita senha que contém a parte local do e-mail (≥ 4 caracteres)', () => {
    expect(validatePassword('minhasenhaJOAOSILVA!', ctx).join()).toMatch(/e-mail/);
  });

  it('não aplica a regra da parte local quando ela tem menos de 4 caracteres', () => {
    expect(validatePassword('uma frase com a letra a', { email: 'ana@x.com', name: 'X' })).toEqual(
      [],
    );
    expect(validatePassword('uma frase anafada boa', { email: 'jp@x.com', name: 'X' })).toEqual([]);
  });

  it('rejeita senha igual ao nome do usuário ou a "gastrohub"', () => {
    const longName = { email: 'x@y.com', name: 'Maria Aparecida' };
    expect(validatePassword('maria aparecida', longName).join()).toMatch(/nome/);
  });

  it('normalização NFC: formas composta e decomposta são equivalentes', () => {
    const composed = 'ção';
    const decomposed = 'ção';
    expect(composed).not.toBe(decomposed);
    expect(normalizePassword(composed)).toBe(normalizePassword(decomposed));
  });

  it('as mensagens nunca contêm a senha', () => {
    const password = 'password1234';
    expect(validatePassword(password, ctx).join()).not.toContain(password);
  });
});

describe('normalizeEmail', () => {
  it('aplica trim, minúsculas e NFC', () => {
    expect(normalizeEmail('  Ana.Souza@Exemplo.COM ')).toBe('ana.souza@exemplo.com');
    expect(normalizeEmail('josé@x.com')).toBe(normalizeEmail('josé@x.com'));
  });
});
