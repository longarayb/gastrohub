// Política de senha (docs/modules/M02-autenticacao.md §9.2, D8).
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@gastrohub/contracts';

import { COMMON_PASSWORDS } from './common-passwords.js';
import { emailLocalPart, normalizeEmail } from './email.js';

/** A regra "não conter a parte local do e-mail" vale a partir deste tamanho (decisão de 2026-10-02). */
export const MIN_LOCAL_PART_LENGTH_FOR_CHECK = 4;

/** Normalização Unicode aplicada antes de validar e de calcular o hash. */
export function normalizePassword(password: string): string {
  return password.normalize('NFC');
}

export interface PasswordContext {
  email: string;
  name: string;
}

/**
 * Valida a nova senha e devolve as violações (vazio = válida). As mensagens nunca
 * repetem a senha.
 */
export function validatePassword(password: string, context: PasswordContext): string[] {
  const normalized = normalizePassword(password);
  // Tamanho em pontos de código (caracteres), não em unidades UTF-16.
  const length = [...normalized].length;
  const lower = normalized.toLowerCase();
  const violations: string[] = [];

  if (length < PASSWORD_MIN_LENGTH) {
    violations.push(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (length > PASSWORD_MAX_LENGTH) {
    violations.push(`A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
  }
  if (COMMON_PASSWORDS.has(lower)) {
    violations.push('Esta senha é muito comum. Escolha outra.');
  }

  const localPart = emailLocalPart(normalizeEmail(context.email));
  if (
    [...localPart].length >= MIN_LOCAL_PART_LENGTH_FOR_CHECK &&
    lower.includes(localPart.toLowerCase())
  ) {
    violations.push('A senha não pode conter o seu e-mail.');
  }

  const name = context.name.normalize('NFC').trim().toLowerCase();
  if ((name && lower === name) || lower === 'gastrohub') {
    violations.push('A senha não pode ser igual ao seu nome ou ao nome do sistema.');
  }

  return violations;
}
