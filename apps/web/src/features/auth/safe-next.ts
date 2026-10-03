/**
 * Destino pós-login (`?next=`): somente caminho relativo interno, para evitar open redirect
 * (M02 §8.2). Qualquer outra coisa vira "/".
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/';
  }
  return next;
}

/** Mensagem exibida no login conforme o motivo do último 401 (§8.3). */
export function sessionEndedMessage(code: string | undefined): string | undefined {
  if (code === 'session_expired') return 'Sua sessão expirou. Entre novamente.';
  if (code === 'session_revoked') return 'Sua sessão foi encerrada. Entre novamente.';
  return undefined;
}
