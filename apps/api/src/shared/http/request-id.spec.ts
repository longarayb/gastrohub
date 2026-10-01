import { describe, expect, it } from 'vitest';

import { resolveRequestId } from './request-id.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reaproveita um request id seguro do cliente', () => {
    expect(resolveRequestId('pdv-01.req_123')).toBe('pdv-01.req_123');
  });

  it('gera UUIDv7 quando o header está ausente', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_V7);
  });

  it.each(['linha\nquebrada', 'com espaço', '<script>', 'a'.repeat(129), ''])(
    'substitui valor inseguro %#',
    (value) => {
      expect(resolveRequestId(value)).toMatch(UUID_V7);
    },
  );

  it('usa o primeiro valor quando o header vem repetido', () => {
    expect(resolveRequestId(['abc', 'def'])).toBe('abc');
  });
});
