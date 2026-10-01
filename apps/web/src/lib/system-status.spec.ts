import { describe, expect, it, vi } from 'vitest';

import { fetchSystemStatus } from './system-status';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('fetchSystemStatus', () => {
  it('API e banco operacionais', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: 'ok', database: 'ok' }));
    await expect(fetchSystemStatus(fetchMock)).resolves.toEqual({ api: 'ok', database: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith('/health/ready', expect.anything());
  });

  it('API responde 503: banco indisponível', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(503, { type: 'about:blank', title: 'x', status: 503 }));
    await expect(fetchSystemStatus(fetchMock)).resolves.toEqual({ api: 'ok', database: 'down' });
  });

  it('falha de rede: API indisponível', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchSystemStatus(fetchMock)).resolves.toEqual({
      api: 'down',
      database: 'unknown',
    });
  });

  it('resposta fora do contrato: banco desconhecido', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { inesperado: true }));
    await expect(fetchSystemStatus(fetchMock)).resolves.toEqual({
      api: 'ok',
      database: 'unknown',
    });
  });
});
