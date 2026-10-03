import { randomInt } from 'node:crypto';

/** CNPJ com formato válido para o banco (sem garantir DV; o DV é validado na aplicação). */
export function randomCnpjFormat(): string {
  return Array.from({ length: 14 }, () => randomInt(0, 10)).join('');
}

const WEIGHTS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_DV2 = [6, ...WEIGHTS_DV1];

function dv(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += (base.charCodeAt(i) - 48) * weights[i]!;
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** CNPJ numérico aleatório com dígitos verificadores válidos (para testes via API/CLI). */
export function randomValidCnpj(): string {
  const base = Array.from({ length: 12 }, () => randomInt(0, 10)).join('');
  const d1 = dv(base, WEIGHTS_DV1);
  return `${base}${d1}${dv(base + d1, WEIGHTS_DV2)}`;
}
