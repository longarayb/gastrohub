import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, mockFetch, problem, renderApp, SESSION } from '../../test/render-app';

const A = { id: '01a10257-07e2-7021-be9e-16e0103da621', tradeName: 'Burger A' };
const B = { id: '01a10257-07e2-7021-be9e-16e0103da622', tradeName: 'Burger B' };

const company = (c: typeof A) => ({
  id: c.id,
  tradeName: c.tradeName,
  legalName: `${c.tradeName} LTDA`,
  taxId: '12ABC34501DE35',
  status: 'active',
});

const branchList = {
  data: [
    {
      id: '01a10257-59c0-72d4-af10-cdbf67ba315c',
      name: 'Centro',
      taxId: null,
      timezone: 'America/Sao_Paulo',
      businessDayCutoff: '04:00',
      address: {
        postalCode: '01310100',
        street: null,
        number: null,
        complement: null,
        district: null,
        city: 'São Paulo',
        state: 'SP',
      },
      status: 'active',
    },
  ],
};

const myCompanies = (active: string | null) => ({
  data: [A, B].map((c) => ({ ...c, legalName: `${c.tradeName} LTDA`, active: c.id === active })),
});

describe('empresas no frontend (M03 §10)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sem empresa ativa, "/" leva ao seletor; escolher troca a empresa e volta ao início', async () => {
    let active: typeof A | null = null;
    const { calls } = mockFetch({
      'GET /api/v1/auth/session': () => json(200, { ...SESSION, activeCompany: active }),
      'GET /api/v1/companies': () => json(200, myCompanies(active?.id ?? null)),
      'POST /api/v1/session/active-company': () => {
        active = B;
        return json(200, {
          session: SESSION.session,
          csrfToken: 'csrf-novo',
          activeCompany: B,
        });
      },
    });
    const { router } = renderApp('/');
    await screen.findByRole('heading', { name: 'Selecionar empresa' });
    expect(router.state.location.pathname).toBe('/selecionar-empresa');

    const buttons = await screen.findAllByRole('button', { name: 'Entrar' });
    fireEvent.click(buttons[1]!); // Burger B
    expect(await screen.findByText('Você está em Burger B.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    const switchCall = calls.find((c) => c.url === '/api/v1/session/active-company')!;
    expect(switchCall.body).toEqual({ companyId: B.id });
    expect(switchCall.headers['X-CSRF-Token']).toBe(SESSION.csrfToken);
    expect(screen.getByTestId('active-company')).toHaveTextContent('Burger B');
  });

  it('com empresa ativa (seleção automática), vai direto ao início', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => json(200, { ...SESSION, activeCompany: A }),
      'GET /api/v1/companies': () => json(200, { data: [{ ...A, legalName: 'A', active: true }] }),
    });
    renderApp('/');
    expect(await screen.findByText('Você está em Burger A.')).toBeInTheDocument();
    // Uma única empresa: sem opção de trocar.
    expect(screen.queryByText('Trocar empresa')).toBeNull();
  });

  it('sem nenhuma empresa vinculada mostra orientação', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => json(200, SESSION),
      'GET /api/v1/companies': () => json(200, { data: [] }),
    });
    renderApp('/');
    expect(await screen.findByText(/não está vinculado a nenhuma empresa/)).toBeInTheDocument();
  });

  it('página Empresa: dados somente leitura, CNPJ formatado e filiais', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => json(200, { ...SESSION, activeCompany: A }),
      'GET /api/v1/companies': () => json(200, myCompanies(A.id)),
      'GET /api/v1/company': () => json(200, company(A)),
      'GET /api/v1/branches': () => json(200, branchList),
    });
    renderApp('/empresa');
    expect(await screen.findByTestId('company-cnpj')).toHaveTextContent('12.ABC.345/01DE-35');
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.getByText(/São Paulo\/SP/)).toBeInTheDocument();
    expect(screen.getByText(/virada do dia às 04:00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar|salvar/i })).toBeNull();
  });

  it('403 company_access_revoked: volta ao seletor com a mensagem', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => json(200, { ...SESSION, activeCompany: A }),
      'GET /api/v1/companies': () => json(200, { data: [] }),
      'GET /api/v1/company': () => problem(403, 'company_access_revoked'),
      'GET /api/v1/branches': () => problem(403, 'company_access_revoked'),
    });
    const { router } = renderApp('/empresa');
    expect(await screen.findByText('Seu acesso a esta empresa foi encerrado.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/selecionar-empresa');
  });

  it('a troca de empresa limpa os dados da empresa anterior do cache', async () => {
    let active: typeof A = A;
    mockFetch({
      'GET /api/v1/auth/session': () => json(200, { ...SESSION, activeCompany: active }),
      'GET /api/v1/companies': () => json(200, myCompanies(active.id)),
      'GET /api/v1/company': () => json(200, company(active)),
      'GET /api/v1/branches': () => json(200, branchList),
      'POST /api/v1/session/active-company': () => {
        active = B;
        return json(200, { session: SESSION.session, csrfToken: 'novo', activeCompany: B });
      },
    });
    const { router, queryClient } = renderApp('/empresa');
    await screen.findByTestId('company-cnpj');
    expect(queryClient.getQueryData(['tenant', 'company'])).toBeDefined();

    await router.navigate('/selecionar-empresa');
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    await screen.findByText('Você está em Burger B.');
    await waitFor(() =>
      expect(
        (queryClient.getQueryData(['tenant', 'company']) as { id?: string } | undefined)?.id,
      ).not.toBe(A.id),
    );
  });
});
