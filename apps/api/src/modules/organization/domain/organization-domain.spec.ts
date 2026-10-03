import { describe, expect, it } from 'vitest';

import {
  isValidCutoff,
  isValidPostalCode,
  isValidTimezone,
  isValidUf,
  normalizePostalCode,
} from './branch-rules.js';
import { formatCnpj, isValidCnpj, normalizeCnpj } from './cnpj.js';

describe('CNPJ (D6)', () => {
  it('aceita CNPJ numérico válido, com ou sem pontuação', () => {
    expect(isValidCnpj(normalizeCnpj('11.222.333/0001-81'))).toBe(true);
    expect(isValidCnpj(normalizeCnpj('11222333000181'))).toBe(true);
  });

  it('aceita o exemplo oficial de CNPJ alfanumérico da Receita Federal', () => {
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(isValidCnpj('12ABC34501DE35')).toBe(true);
  });

  it('rejeita dígitos verificadores errados', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('12ABC34501DE36')).toBe(false);
  });

  it('rejeita formato inválido e sequências repetidas', () => {
    expect(isValidCnpj('1122233300018')).toBe(false); // 13 caracteres
    expect(isValidCnpj('12ABC34501DEAB')).toBe(false); // DV não numérico
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
  });

  it('formata para exibição', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });
});

describe('regras de filial (D7)', () => {
  it('fuso IANA', () => {
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('America/Manaus')).toBe(true);
    expect(isValidTimezone('Brasil/Brasilia')).toBe(false);
  });

  it('virada do dia operacional HH:MM', () => {
    expect(isValidCutoff('04:00')).toBe(true);
    expect(isValidCutoff('23:59')).toBe(true);
    expect(isValidCutoff('24:00')).toBe(false);
    expect(isValidCutoff('4:00')).toBe(false);
  });

  it('UF e CEP', () => {
    expect(isValidUf('SP')).toBe(true);
    expect(isValidUf('XX')).toBe(false);
    expect(normalizePostalCode('01310-100')).toBe('01310100');
    expect(isValidPostalCode('01310100')).toBe(true);
    expect(isValidPostalCode('0131010')).toBe(false);
  });
});
