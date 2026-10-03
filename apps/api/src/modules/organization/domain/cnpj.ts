// CNPJ numérico e alfanumérico (M03 §3.1, D6).
//
// Formato normalizado: 12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos.
// Valor de cada caractere no cálculo do DV: código ASCII − 48 ('0'..'9' → 0..9, 'A' → 17 … 'Z' → 42).
// Para CNPJs só numéricos, o resultado é idêntico ao algoritmo tradicional.

const WEIGHTS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_DV2 = [6, ...WEIGHTS_DV1];
const FORMAT = /^[0-9A-Z]{12}[0-9]{2}$/;

/** Remove pontuação e espaços e converte para maiúsculas. */
export function normalizeCnpj(raw: string): string {
  return raw.replace(/[.\-/\s]/g, '').toUpperCase();
}

function checkDigit(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += (base.charCodeAt(i) - 48) * weights[i]!;
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** CNPJ já normalizado é válido (formato + dígitos verificadores)? */
export function isValidCnpj(normalized: string): boolean {
  if (!FORMAT.test(normalized)) return false;
  // Sequências repetidas (ex.: 00000000000000) passam no DV, mas não são CNPJs válidos.
  if (/^(.)\1{13}$/.test(normalized)) return false;
  const base = normalized.slice(0, 12);
  const dv1 = checkDigit(base, WEIGHTS_DV1);
  const dv2 = checkDigit(base + dv1, WEIGHTS_DV2);
  return normalized.endsWith(`${dv1}${dv2}`);
}

/** Exibição: 12.ABC.345/01DE-35. */
export function formatCnpj(normalized: string): string {
  return normalized.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}
