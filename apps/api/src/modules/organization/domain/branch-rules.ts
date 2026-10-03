// Regras de filial (M03 §3.2, D7).

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;
export type Uf = (typeof UFS)[number];

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
export const DEFAULT_BUSINESS_DAY_CUTOFF = '04:00';

const KNOWN_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

/** Fuso IANA válido no runtime (ex.: America/Sao_Paulo, America/Manaus). */
export function isValidTimezone(timezone: string): boolean {
  return KNOWN_TIMEZONES.has(timezone);
}

/** Virada do dia operacional no formato HH:MM (00:00–23:59). */
export function isValidCutoff(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidUf(value: string): value is Uf {
  return (UFS as readonly string[]).includes(value);
}

/** CEP normalizado: 8 dígitos. */
export function normalizePostalCode(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidPostalCode(normalized: string): boolean {
  return /^\d{8}$/.test(normalized);
}
