import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SystemStatusPage } from './system-status-page';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemStatusPage />
    </QueryClientProvider>,
  );
}

describe('SystemStatusPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra API e banco operacionais', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ status: 'ok', database: 'ok' })),
    );
    renderPage();
    expect(await screen.findByTestId('status-API')).toHaveTextContent('Operacional');
    expect(screen.getByTestId('status-Banco de dados')).toHaveTextContent('Operacional');
  });

  it('mostra banco indisponível quando a API responde 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ status: 503 }, { status: 503 })),
    );
    renderPage();
    expect(await screen.findByTestId('status-API')).toHaveTextContent('Operacional');
    expect(screen.getByTestId('status-Banco de dados')).toHaveTextContent('Indisponível');
  });

  it('mostra API indisponível quando não há resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderPage();
    expect(await screen.findByTestId('status-API')).toHaveTextContent('Indisponível');
    expect(screen.getByTestId('status-Banco de dados')).toHaveTextContent('Desconhecido');
  });
});
