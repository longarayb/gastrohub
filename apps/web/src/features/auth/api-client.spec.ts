import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, mockFetch, problem, SESSION } from '../../test/render-app';
import {
  ApiError,
  apiFetch,
  NetworkError,
  SESSION_QUERY_KEY,
  type SessionState,
} from './api-client';

function clientWithSession(): QueryClient {
  const queryClient = new QueryClient();
  const state: SessionState = { status: 'authenticated', data: SESSION };
  queryClient.setQueryData(SESSION_QUERY_KEY, state);
  return queryClient;
}

describe('apiFetch (§8.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envia X-CSRF-Token só em métodos mutáveis, com credentials same-origin', async () => {
    const { calls, fetchMock } = mockFetch({
      'GET /api/v1/auth/sessions': () => json(200, { data: [] }),
      'POST /api/v1/auth/sessions/revoke-others': () => new Response(null, { status: 204 }),
      'DELETE /api/v1/auth/sessions/x': () => new Response(null, { status: 204 }),
    });
    const queryClient = clientWithSession();

    await apiFetch(queryClient, '/api/v1/auth/sessions');
    await apiFetch(queryClient, '/api/v1/auth/sessions/revoke-others', { method: 'POST' });
    await apiFetch(queryClient, '/api/v1/auth/sessions/x', { method: 'DELETE' });

    expect(calls[0]!.headers['X-CSRF-Token']).toBeUndefined();
    expect(calls[1]!.headers['X-CSRF-Token']).toBe(SESSION.csrfToken);
    expect(calls[2]!.headers['X-CSRF-Token']).toBe(SESSION.csrfToken);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('envia JSON com Content-Type apenas quando há corpo', async () => {
    const { calls } = mockFetch({ 'POST /api/v1/auth/login': () => json(200, SESSION) });
    await apiFetch(new QueryClient(), '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'a@b.co', password: 'x' },
    });
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
    expect(calls[0]!.body).toEqual({ email: 'a@b.co', password: 'x' });
  });

  it('converte Problem Details em ApiError com code, detail e Retry-After', async () => {
    mockFetch({
      'POST /api/v1/auth/login': () =>
        problem(429, 'rate_limited', 'Muitas requisições.', { 'Retry-After': '120' }),
    });
    const error = await apiFetch(new QueryClient(), '/api/v1/auth/login', {
      method: 'POST',
      body: {},
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', retryAfterSeconds: 120 });
  });

  it('falha de rede vira NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch(new QueryClient(), '/api/v1/auth/session')).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it('401 em qualquer chamada marca a sessão como anônima com o motivo', async () => {
    mockFetch({ 'GET /api/v1/auth/sessions': () => problem(401, 'session_revoked') });
    const queryClient = clientWithSession();
    await apiFetch(queryClient, '/api/v1/auth/sessions').catch(() => undefined);
    expect(queryClient.getQueryData(SESSION_QUERY_KEY)).toEqual({
      status: 'anonymous',
      code: 'session_revoked',
    });
  });
});
