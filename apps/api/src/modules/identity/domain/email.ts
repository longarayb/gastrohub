/** Normalização de e-mail (M02 §4.2, D6): NFC + trim + minúsculas. */
export function normalizeEmail(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase();
}

/** Parte local do e-mail (antes do último "@"). */
export function emailLocalPart(normalizedEmail: string): string {
  const at = normalizedEmail.lastIndexOf('@');
  return at > 0 ? normalizedEmail.slice(0, at) : normalizedEmail;
}
