import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';

import { routes } from '../app';

export interface FakeCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (call: FakeCall) => Response | Promise<Response>;

export const json = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export const problem = (status: number, code: string, detail?: string, headers = {}) =>
  json(status, { type: 'about:blank', title: 'Erro', status, code, detail }, headers);

export const SESSION = {
  user: { id: '01a0f904-550e-7054-ac7c-b7a61c0a0b3d', email: 'ana@teste.local', name: 'Ana' },
  session: {
    id: '01a0f904-550e-7054-ac7c-b7a61c0a0b3e',
    createdAt: '2026-10-02T12:00:00.000Z',
    expiresAt: '2026-10-09T12:00:00.000Z',
    idleExpiresAt: '2026-10-03T00:00:00.000Z',
  },
  csrfToken: 'csrf-token-de-teste',
};

/** Substitui fetch por um roteador de respostas e registra as chamadas. */
export function mockFetch(routesByKey: Record<string, Handler>) {
  const calls: FakeCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: FakeCall = {
      method: init.method ?? 'GET',
      url: String(input),
      headers: (init.headers as Record<string, string>) ?? {},
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const handler = routesByKey[`${call.method} ${call.url}`];
    if (!handler) return problem(404, 'not_found');
    return handler(call);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export interface RenderedApp {
  router: ReturnType<typeof createMemoryRouter>;
  queryClient: QueryClient;
  unmount: () => void;
}

export function renderApp(initialPath: string): RenderedApp {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, unmount: view.unmount };
}
