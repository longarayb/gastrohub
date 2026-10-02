import { describe, expect, it } from 'vitest';

import { safeNext, sessionEndedMessage } from './safe-next';

describe('safeNext (§8.2)', () => {
  it('aceita caminhos internos', () => {
    expect(safeNext('/conta')).toBe('/conta');
    expect(safeNext('/conta/sessoes?x=1')).toBe('/conta/sessoes?x=1');
  });

  it.each(['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/\\evil.com', '', null])(
    'rejeita %s',
    (value) => {
      expect(safeNext(value)).toBe('/');
    },
  );
});

describe('sessionEndedMessage', () => {
  it('mensagens por motivo', () => {
    expect(sessionEndedMessage('session_expired')).toMatch(/expirou/);
    expect(sessionEndedMessage('session_revoked')).toMatch(/encerrada/);
    expect(sessionEndedMessage('unauthenticated')).toBeUndefined();
  });
});
